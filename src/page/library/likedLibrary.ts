// The user's liked songs, shared by the features: a local index (built with fetchLibraryTracks,
// checked with one small page at most every 10 minutes), the player's own likes and unlikes
// applied from its requests, and the library writes our rows can make (applyCurations, only on
// an explicit user action, CLAUDE.md §2.10).
import type { LikedIndex } from '../../shared/likedIndex';
import {
  curationVariables,
  EDITABLE_PAGE_SIZE,
  LIKED_SONGS_CONTEXT,
  OPERATIONS,
  parseCurationResult,
  parseEditablePlaylists,
  parseLibraryChange,
  parseLibraryPage,
  parseProfileUri,
  type EditablePlaylist,
} from '../adapters/libraryShapes';
import type { CapturedRequest } from '../core/interceptor';
import type { PathfinderClient } from '../core/pathfinderClient';
import { debugLog, debugWarn } from '../debug/log';
import type { CurationChange } from '../ui/saveDialog';
import { buildIndex, isStale, refreshIndex, removeTracks, type FetchPage } from './indexSync';

export interface LikedLibraryDeps {
  client: PathfinderClient | null;
  loadIndex(key: string): Promise<LikedIndex | null>;
  saveIndex(key: string, index: LikedIndex | null): void;
  /**
   * Whether a feature still needs the index. Checked before every request of a sync: the
   * features start with their defaults and the user's settings may turn them off meanwhile.
   */
  wanted?: () => boolean;
  now?: () => number;
}

/** After a failure, the index is not tried again for this long. */
const RETRY_AFTER_MS = 60_000;
/** How long to wait for the player's own profileAttributes before asking ourselves. */
const PROFILE_WAIT_MS = 4000;
/** At most this many editablePlaylists pages for one dialog or submenu. */
const MAX_PLAYLIST_PAGES = 4;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class LikedLibrary {
  private profile: string | null = null;
  private userKey: string | null = null;
  private current: LikedIndex | null = null;
  private likedIds: Set<string> | null = null;
  private loaded = false;
  /** A like was seen: check the server even if the index is recent. */
  private dirty = false;
  /** Number of likes seen, so a sync knows whether one arrived while it was running. */
  private likesSeen = 0;
  private syncing: Promise<void> | null = null;
  private failedAt = Number.NEGATIVE_INFINITY;
  private profileWaiters: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;

  constructor(private readonly deps: LikedLibraryDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** `spotify:user:<id>` once known (memory only; never stored or sent on the bridge). */
  get profileUri(): string | null {
    return this.profile;
  }

  get index(): LikedIndex | null {
    return this.current;
  }

  isLiked(trackId: string): boolean {
    if (!this.current) return false;
    this.likedIds ??= new Set(this.current.tracks.map((track) => track.t));
    return this.likedIds.has(trackId);
  }

  /** Called after every change of the index; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCapture(capture: CapturedRequest): void {
    if (capture.kind !== 'pathfinder') return;
    if (capture.operationName === OPERATIONS.profile) {
      const uri = parseProfileUri(capture.json);
      if (uri) {
        this.profile = uri;
        for (const wake of this.profileWaiters.splice(0)) wake();
      }
    }
    if (capture.status >= 200 && capture.status < 300) {
      const change = parseLibraryChange(capture.operationName, capture.variables);
      if (change) this.applyChange(change.kind, change.trackIds);
    }
  }

  /** Loads the index, and builds or refreshes it when needed. Never throws. */
  ensureFresh(): Promise<void> {
    this.syncing ??= this.sync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  /** The liked songs and the user's editable playlists, each saying whether it has the track. */
  async playlistsFor(trackId: string): Promise<EditablePlaylist[]> {
    const client = this.deps.client;
    if (!client) throw new Error('no client');
    const uris = [`spotify:track:${trackId}`];
    const playlists: EditablePlaylist[] = [];
    let offset = 0;
    for (let page = 0; page < MAX_PLAYLIST_PAGES; page += 1) {
      const result = await client.query(OPERATIONS.editablePlaylists, { offset, limit: EDITABLE_PAGE_SIZE, textFilter: '', uris });
      const parsed = parseEditablePlaylists(result.data);
      if (!parsed) throw new Error(`unexpected ${OPERATIONS.editablePlaylists} response`);
      playlists.push(...parsed.playlists);
      offset += parsed.itemCount;
      if (parsed.itemCount === 0 || offset >= parsed.total) break;
    }
    return playlists;
  }

  /**
   * Saves or removes a track like the player's "saved in" dialog (applyCurations). Our own
   * requests are not observed by the interceptor, so liked songs changes are applied here.
   */
  async curate(trackId: string, changes: CurationChange[]): Promise<boolean> {
    const client = this.deps.client;
    if (!client || !changes.length) return false;
    const result = await client.query(OPERATIONS.applyCurations, curationVariables([`spotify:track:${trackId}`], changes));
    if (result.errors.length || !parseCurationResult(result.data)) {
      debugWarn('liked songs: applyCurations failed', result.errors);
      return false;
    }
    const liked = changes.find((change) => change.contextUri === LIKED_SONGS_CONTEXT);
    if (liked) this.applyChange(liked.curationType === 'UNCURATE' ? 'removed' : 'added', [trackId]);
    return true;
  }

  private applyChange(kind: 'added' | 'removed', trackIds: string[]): void {
    if (kind === 'added') {
      // Details (artist, title) come with the next check of the first page. A sync already
      // running may have read that page before this like: check again once it ends.
      this.dirty = true;
      this.likesSeen += 1;
      const running = this.syncing;
      void (running ? running.then(() => this.ensureFresh()) : this.ensureFresh());
      return;
    }
    if (!this.current || !this.userKey) return;
    this.setIndex(removeTracks(this.current, trackIds));
    this.deps.saveIndex(this.userKey, this.current);
  }

  private setIndex(index: LikedIndex | null): void {
    if (index === this.current) return;
    this.current = index;
    this.likedIds = null;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // A failing listener must not stop the others.
      }
    }
  }

  private waitForProfile(timeoutMs: number): Promise<void> {
    if (this.profile) return Promise.resolve();
    return new Promise((resolve) => {
      this.profileWaiters.push(resolve);
      setTimeout(resolve, timeoutMs);
    });
  }

  /** Hashed per-user key of the local storage (never the user ID itself); null until known. */
  storageKey(): Promise<string | null> {
    return this.ensureUserKey();
  }

  private async ensureUserKey(): Promise<string | null> {
    if (this.userKey) return this.userKey;
    // The player asks for its profile at startup: wait for it before asking ourselves.
    await this.waitForProfile(PROFILE_WAIT_MS);
    if (!this.profile && this.deps.client) {
      const result = await this.deps.client.query(OPERATIONS.profile, {});
      this.profile = parseProfileUri({ data: result.data });
    }
    if (!this.profile) return null;
    this.userKey = await sha256Hex(this.profile);
    return this.userKey;
  }

  private async sync(): Promise<void> {
    const client = this.deps.client;
    const wanted = this.deps.wanted ?? (() => true);
    const likesBefore = this.likesSeen;
    if (!client || this.now() - this.failedAt < RETRY_AFTER_MS) return;
    try {
      // Nothing can be done before the player's first requests (session headers, hashes).
      if (!(await client.waitForSession()) || !wanted()) return;
      const key = await this.ensureUserKey();
      if (!key) return;
      if (!this.loaded) {
        this.setIndex(await this.deps.loadIndex(key));
        this.loaded = true;
      }
      const now = this.now();
      if ((this.current && !this.dirty && !isStale(this.current, now)) || !wanted()) return;

      const fetchPage: FetchPage = async (offset, limit) => {
        const result = await client.query(OPERATIONS.libraryTracks, { offset, limit });
        const page = parseLibraryPage(result.data);
        if (!page) throw new Error(`unexpected ${OPERATIONS.libraryTracks} response`);
        return page;
      };
      if (this.current) {
        const { index, mode } = await refreshIndex(this.current, fetchPage, now);
        debugLog(`liked songs: index ${mode} (${index.tracks.length} tracks)`);
        this.setIndex(index);
      } else {
        const index = await buildIndex(fetchPage, now);
        debugLog(`liked songs: index built (${index.tracks.length} tracks, ${client.sent} requests so far)`);
        this.setIndex(index);
      }
      // A like seen meanwhile may be missing from what was read: keep it pending.
      if (this.likesSeen === likesBefore) this.dirty = false;
      this.deps.saveIndex(key, this.current);
    } catch (error) {
      // Fail silently: the features show nothing. Tried again later, after a pause.
      this.failedAt = this.now();
      debugWarn('liked songs: index unavailable', error instanceof Error ? error.message : error);
    }
  }
}

