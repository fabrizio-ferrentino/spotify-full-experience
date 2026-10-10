// Playlist contents for search and sort. Pages the player already loaded are kept (passive);
// the missing ones are fetched only when the user searches or sorts, with fetchPlaylistContents
// at the largest page size through the rate-limited client. Writes to a playlist seen in the
// player's traffic (or made by us) drop its cache, and so does a new revision.
import { OPERATIONS, PLAYLIST_PAGE_MAX, parsePlaylistPage, type PlaylistPage, type PlaylistTrack } from '../../adapters/libraryShapes';
import type { PathfinderClient } from '../../core/pathfinderClient';

/** Larger playlists are searched and sorted on their first MAX_ITEMS rows only. */
export const MAX_ITEMS = 10_000;
/** Cached contents older than this are fetched again. */
const TTL_MS = 5 * 60_000;
const PLAYLIST_URI = /spotify:playlist:[A-Za-z0-9]{22}/g;
const READ_OPERATIONS: ReadonlySet<string> = new Set([OPERATIONS.playlist, OPERATIONS.playlistContents]);

interface Entry {
  total: number;
  revision: string | null;
  /** Rows by position: undefined = not loaded yet, null = not a track. */
  items: (PlaylistTrack | null | undefined)[];
  updatedAt: number;
  loading: Promise<void> | null;
}

export interface PlaylistContents {
  tracks: PlaylistTrack[];
  total: number;
  /** Only the first MAX_ITEMS rows were considered. */
  partial: boolean;
}

export class PlaylistStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(
    private readonly client: PathfinderClient | null,
    now?: () => number,
  ) {
    this.now = now ?? (() => Date.now());
  }

  /** A page of fetchPlaylist / fetchPlaylistContents seen in the player's traffic. */
  observePage(variables: unknown, data: unknown): void {
    const page = parsePlaylistPage(variables, data);
    if (page) this.merge(page);
  }

  /** Any other Pathfinder request of the player mentioning a playlist may change it. */
  observeRequest(operationName: string | null, variables: unknown): void {
    if (operationName && READ_OPERATIONS.has(operationName)) return;
    let text: string;
    try {
      text = JSON.stringify(variables) ?? '';
    } catch {
      return;
    }
    for (const uri of text.match(PLAYLIST_URI) ?? []) this.invalidate(uri);
  }

  invalidate(uri: string): void {
    this.entries.delete(uri);
  }

  /** Every row (up to MAX_ITEMS), loading what is missing. Throws on failure. */
  async load(uri: string): Promise<PlaylistContents> {
    let entry = this.entries.get(uri);
    if (entry && this.now() - entry.updatedAt > TTL_MS && !entry.loading) {
      this.entries.delete(uri);
      entry = undefined;
    }
    if (!entry || this.missingFrom(entry) !== null) {
      const pending = entry?.loading ?? this.fetchMissing(uri);
      await pending;
      entry = this.entries.get(uri);
    }
    if (!entry || this.missingFrom(entry) !== null) throw new Error('playlist contents incomplete');
    const limit = Math.min(entry.total, MAX_ITEMS);
    const tracks = entry.items.slice(0, limit).filter((item): item is PlaylistTrack => !!item);
    return { tracks, total: entry.total, partial: entry.total > MAX_ITEMS };
  }

  private merge(page: PlaylistPage): void {
    let entry = this.entries.get(page.uri);
    if (!entry || entry.total !== page.total || (page.revision && entry.revision && page.revision !== entry.revision)) {
      entry = { total: page.total, revision: page.revision, items: [], updatedAt: this.now(), loading: entry?.loading ?? null };
      this.entries.set(page.uri, entry);
    }
    if (page.revision) entry.revision = page.revision;
    page.items.forEach((item, i) => {
      if (page.offset + i < MAX_ITEMS) entry.items[page.offset + i] = item;
    });
    entry.updatedAt = this.now();
  }

  /** First position not loaded yet, or null when everything (up to MAX_ITEMS) is there. */
  private missingFrom(entry: Entry): number | null {
    const limit = Math.min(entry.total, MAX_ITEMS);
    for (let i = 0; i < limit; i += 1) if (entry.items[i] === undefined) return i;
    return null;
  }

  private fetchMissing(uri: string): Promise<void> {
    const client = this.client;
    if (!client) return Promise.reject(new Error('no client'));
    const run = (async () => {
      // One page at a time from the first gap; each page fills its slots, gaps or not.
      for (let guard = 0; guard <= Math.ceil(MAX_ITEMS / PLAYLIST_PAGE_MAX) + 1; guard += 1) {
        const entry = this.entries.get(uri);
        const offset = entry ? this.missingFrom(entry) : 0;
        if (offset === null) return;
        const variables = { uri, offset, limit: PLAYLIST_PAGE_MAX, includeEpisodeContentRatingsV2: true };
        const result = await client.query(OPERATIONS.playlistContents, variables);
        const page = parsePlaylistPage(variables, result.data);
        if (!page) throw new Error(`unexpected ${OPERATIONS.playlistContents} response`);
        this.merge(page);
        if (page.items.length === 0) return;
      }
    })();
    const tracked = run.finally(() => {
      const entry = this.entries.get(uri);
      if (entry?.loading === tracked) entry.loading = null;
    });
    const entry = this.entries.get(uri);
    if (entry) entry.loading = tracked;
    return tracked;
  }
}
