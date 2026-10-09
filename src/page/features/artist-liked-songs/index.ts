// Feature: on artist pages, "You've liked N songs by <artist>" (primary artist only, as on the
// desktop app), from a local index of the user's liked songs.
// Requests: the index is built with fetchLibraryTracks (2 pages for ~1200 songs), then checked
// with one small page at most every 10 minutes when an artist page is opened. Likes and unlikes
// made in the player are applied from its own requests.
import type { LikedIndex } from '../../../shared/likedIndex';
import {
  OPERATIONS,
  parseArtistOverview,
  parseLibraryChange,
  parseLibraryPage,
  parseProfileUri,
  type ArtistInfo,
} from '../../adapters/libraryShapes';
import type { PageInfo } from '../../adapters/routes';
import { headerTitleOf, popularBlockOf, SELECTORS } from '../../adapters/spotifyDom';
import { frameScheduler, whenAvailable } from '../../core/dom';
import type { CapturedRequest } from '../../core/interceptor';
import type { PathfinderClient } from '../../core/pathfinderClient';
import { debugLog, debugWarn } from '../../debug/log';
import { LikedSongsCard } from './card';
import { buildIndex, isStale, refreshIndex, removeTracks, tracksByArtist, type FetchPage } from './indexSync';

export interface LikedSongsDeps {
  client: PathfinderClient | null;
  loadIndex(key: string): Promise<LikedIndex | null>;
  saveIndex(key: string, index: LikedIndex | null): void;
  now?: () => number;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class ArtistLikedSongsFeature {
  private enabled = false;
  private artistId: string | null = null;
  private profileUri: string | null = null;
  private userKey: string | null = null;
  private index: LikedIndex | null = null;
  private indexLoaded = false;
  /** A like was seen: check the server even if the index is recent. */
  private dirty = false;
  private syncing: Promise<void> | null = null;
  private failed = false;
  private readonly artists = new Map<string, ArtistInfo>();
  private card: LikedSongsCard | null = null;
  private mainObserver: MutationObserver | null = null;
  private cancelWait: (() => void) | null = null;
  private readonly scheduler = frameScheduler(() => this.render());
  private readonly now: () => number;

  constructor(private readonly deps: LikedSongsDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    if (this.artistId) this.showArtist();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.stopWatching();
  }

  teardown(): void {
    this.disable();
  }

  onPageChange(page: PageInfo): void {
    this.artistId = page.kind === 'artist' ? page.id : null;
    this.stopWatching();
    if (this.enabled && this.artistId) this.showArtist();
  }

  onCapture(capture: CapturedRequest): void {
    if (!this.enabled || capture.kind !== 'pathfinder') return;
    const operation = capture.operationName;
    if (operation === OPERATIONS.profile) {
      const uri = parseProfileUri(capture.json);
      if (uri) this.profileUri = uri;
    } else if (operation === OPERATIONS.artistOverview) {
      const artist = parseArtistOverview(capture.json);
      if (artist) {
        this.artists.set(artist.id, artist);
        if (artist.id === this.artistId) this.scheduler.schedule();
      }
    }
    if (capture.status >= 200 && capture.status < 300) {
      const change = parseLibraryChange(operation, capture.variables);
      if (change) this.applyChange(change.kind, change.trackIds);
    }
  }

  private applyChange(kind: 'added' | 'removed', trackIds: string[]): void {
    if (kind === 'added') {
      this.dirty = true; // details (artist, title) come with the next check of the first page
      if (this.artistId) this.showArtist();
      return;
    }
    if (!this.index || !this.userKey) return;
    this.index = removeTracks(this.index, trackIds);
    this.deps.saveIndex(this.userKey, this.index);
    this.scheduler.schedule();
  }

  /** Loads and refreshes the index if needed, then renders the card when the page is ready. */
  private showArtist(): void {
    this.watchPage();
    void this.ensureFresh().then(() => this.scheduler.schedule());
  }

  private async ensureUserKey(): Promise<string | null> {
    if (this.userKey) return this.userKey;
    if (!this.profileUri && this.deps.client) {
      // The player asks for the profile at startup; ask ourselves only if that was missed.
      const result = await this.deps.client.query(OPERATIONS.profile, {});
      this.profileUri = parseProfileUri({ data: result.data });
    }
    if (!this.profileUri) return null;
    this.userKey = await sha256Hex(this.profileUri);
    return this.userKey;
  }

  private ensureFresh(): Promise<void> {
    this.syncing ??= this.sync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async sync(): Promise<void> {
    const client = this.deps.client;
    if (!client || this.failed) return;
    try {
      const key = await this.ensureUserKey();
      if (!key) return;
      if (!this.indexLoaded) {
        this.index = await this.deps.loadIndex(key);
        this.indexLoaded = true;
      }
      const now = this.now();
      if (this.index && !this.dirty && !isStale(this.index, now)) return;

      const fetchPage: FetchPage = async (offset, limit) => {
        const result = await client.query(OPERATIONS.libraryTracks, { offset, limit });
        const page = parseLibraryPage(result.data);
        if (!page) throw new Error(`unexpected ${OPERATIONS.libraryTracks} response`);
        return page;
      };
      if (this.index) {
        const { index, mode } = await refreshIndex(this.index, fetchPage, now);
        this.index = index;
        debugLog(`liked songs: index ${mode} (${index.tracks.length} tracks)`);
      } else {
        this.index = await buildIndex(fetchPage, now);
        debugLog(`liked songs: index built (${this.index.tracks.length} tracks, ${client.sent} requests so far)`);
      }
      this.dirty = false;
      this.deps.saveIndex(key, this.index);
    } catch (error) {
      // Fail silently: no card. Retry on a later page change only after a reload.
      this.failed = true;
      debugWarn('liked songs: index unavailable', error instanceof Error ? error.message : error);
    }
  }

  /** Re-renders when the page content changes (the Popular block appears late). */
  private watchPage(): void {
    if (this.mainObserver || this.cancelWait) return;
    this.cancelWait = whenAvailable<HTMLElement>(SELECTORS.main, (main) => {
      this.cancelWait = null;
      if (!this.enabled || !this.artistId) return;
      this.mainObserver = new MutationObserver(() => this.scheduler.schedule());
      this.mainObserver.observe(main, { childList: true, subtree: true });
      this.scheduler.schedule();
    });
  }

  private stopWatching(): void {
    this.cancelWait?.();
    this.cancelWait = null;
    this.mainObserver?.disconnect();
    this.mainObserver = null;
    this.scheduler.cancel();
    this.card?.remove();
    this.card = null;
  }

  private render(): void {
    const artistId = this.artistId;
    if (!this.enabled || !artistId || !this.index) return;
    const tracks = tracksByArtist(this.index, artistId);
    if (tracks.length === 0) {
      this.card?.remove();
      this.card = null;
      return;
    }
    const main = document.querySelector<HTMLElement>(SELECTORS.main);
    const block = main ? popularBlockOf(main) : null;
    if (!block) return;
    if (!this.card || !this.card.mounted) {
      this.card?.remove();
      this.card = new LikedSongsCard(block);
    }
    const artist = this.artists.get(artistId);
    const name = artist?.name ?? (main ? headerTitleOf(main) : null);
    if (!name) return;
    this.card.update({ artistName: name, imageUrl: artist?.imageUrl ?? null, tracks, now: this.now() });
    this.card.mount();
  }
}
