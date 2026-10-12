// Album tracks for search and sort. The pages the player loads (getAlbum, then queryAlbumTracks
// while scrolling) are kept as they pass; the missing ones are fetched only when the user
// searches or sorts, with queryAlbumTracks at the largest page size through the rate-limited
// client. Play counts change slowly, so an album is fetched again only after a while.
import { ALBUM_PAGE_MAX, OPERATIONS, parseAlbumPage, type AlbumPage, type AlbumTrack } from '../../adapters/libraryShapes';
import type { PathfinderClient } from '../../core/pathfinderClient';

/** Larger albums (box sets) are searched and sorted on their first MAX_ITEMS rows only. */
export const MAX_ITEMS = 3000;
/** Cached tracks older than this are fetched again (at most one album load per 15 minutes). */
const TTL_MS = 15 * 60_000;

interface Entry {
  total: number;
  name: string | null;
  cover: string | null;
  /** Rows by position: undefined = not loaded yet, null = not usable. */
  items: (AlbumTrack | null | undefined)[];
  updatedAt: number;
  loading: Promise<void> | null;
}

export interface AlbumContents {
  tracks: AlbumTrack[];
  total: number;
  /** Only the first MAX_ITEMS rows were considered. */
  partial: boolean;
}

export class AlbumStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(
    private readonly client: PathfinderClient | null,
    now?: () => number,
  ) {
    this.now = now ?? (() => Date.now());
  }

  /** A page of getAlbum / queryAlbumTracks seen in the player's traffic. */
  observePage(variables: unknown, data: unknown): void {
    const page = parseAlbumPage(variables, data);
    if (page) this.merge(page);
  }

  /** Every row (up to MAX_ITEMS), loading what is missing. Throws on failure. */
  async load(uri: string): Promise<AlbumContents> {
    let entry = this.entries.get(uri);
    if (entry && this.now() - entry.updatedAt > TTL_MS && !entry.loading) {
      this.entries.delete(uri);
      entry = undefined;
    }
    if (!entry || this.missingFrom(entry) !== null) {
      await (entry?.loading ?? this.fetchMissing(uri));
      entry = this.entries.get(uri);
    }
    if (!entry || this.missingFrom(entry) !== null) throw new Error('album tracks incomplete');
    const limit = Math.min(entry.total, MAX_ITEMS);
    const tracks = entry.items
      .slice(0, limit)
      .filter((item): item is AlbumTrack => !!item)
      // Pages of queryAlbumTracks have no album name or cover: take them from getAlbum.
      .map((track) => ({ ...track, al: track.al || entry.name || '', c: track.c || entry.cover || '' }));
    return { tracks, total: entry.total, partial: entry.total > MAX_ITEMS };
  }

  private merge(page: AlbumPage): void {
    let entry = this.entries.get(page.uri);
    if (!entry || entry.total !== page.total) {
      entry = { total: page.total, name: null, cover: null, items: [], updatedAt: this.now(), loading: entry?.loading ?? null };
      this.entries.set(page.uri, entry);
    }
    entry.name = page.name ?? entry.name;
    entry.cover = page.cover ?? entry.cover;
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
      for (let guard = 0; guard <= Math.ceil(MAX_ITEMS / ALBUM_PAGE_MAX) + 1; guard += 1) {
        const entry = this.entries.get(uri);
        const offset = entry ? this.missingFrom(entry) : 0;
        if (offset === null) return;
        const variables = { uri, offset, limit: ALBUM_PAGE_MAX };
        const result = await client.query(OPERATIONS.albumTracks, variables);
        const page = parseAlbumPage(variables, result.data);
        if (!page) throw new Error(`unexpected ${OPERATIONS.albumTracks} response`);
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
