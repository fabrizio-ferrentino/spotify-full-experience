// Builds and refreshes the liked songs index (CLAUDE.md §6): full paging on first build, then a
// cheap check of the first page that only prepends what is new; anything inconsistent triggers
// a full rebuild.
import type { LikedIndex, LikedTrack } from '../../../shared/likedIndex';
import { LIBRARY_PAGE_MAX, type LibraryPage } from '../../adapters/libraryShapes';

export type FetchPage = (offset: number, limit: number) => Promise<LibraryPage>;

/** Size of the first page fetched to check for news. */
export const CHECK_PAGE_SIZE = 50;
/** An index older than this is checked again when an artist page is opened. */
export const REFRESH_AFTER_MS = 10 * 60_000;
/** Hard stop for paging (20 000 tracks at 1000 per page). */
const MAX_PAGES = 20;

export async function buildIndex(fetchPage: FetchPage, now: number): Promise<LikedIndex> {
  const tracks: LikedTrack[] = [];
  let total = 0;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage(offset, LIBRARY_PAGE_MAX);
    total = result.total;
    tracks.push(...result.tracks);
    offset += result.itemCount;
    if (result.itemCount === 0 || offset >= total) break;
  }
  return { v: 2, checkedAt: now, total, tracks };
}

export function isStale(index: LikedIndex, now: number): boolean {
  return now - index.checkedAt > REFRESH_AFTER_MS;
}

export interface RefreshResult {
  index: LikedIndex;
  mode: 'incremental' | 'rebuild';
}

/** Checks the first page: prepends new likes when the counts add up, otherwise rebuilds. */
export async function refreshIndex(index: LikedIndex, fetchPage: FetchPage, now: number): Promise<RefreshResult> {
  const head = await fetchPage(0, CHECK_PAGE_SIZE);
  const newest = index.tracks[0];
  if (!newest) {
    if (head.total === 0) return { index: { ...index, checkedAt: now, total: 0, tracks: [] }, mode: 'incremental' };
    return { index: await buildIndex(fetchPage, now), mode: 'rebuild' };
  }
  const known = head.tracks.findIndex((track) => track.t === newest.t && track.d === newest.d);
  // Consistent only if the newest known like is still there and nothing else changed below it.
  if (known >= 0 && head.total === index.total + known) {
    return {
      index: { ...index, checkedAt: now, total: head.total, tracks: [...head.tracks.slice(0, known), ...index.tracks] },
      mode: 'incremental',
    };
  }
  return { index: await buildIndex(fetchPage, now), mode: 'rebuild' };
}

/** Applies unlikes made by the player, without any request. */
export function removeTracks(index: LikedIndex, trackIds: readonly string[]): LikedIndex {
  const remove = new Set(trackIds);
  const tracks = index.tracks.filter((track) => !remove.has(track.t));
  const removed = index.tracks.length - tracks.length;
  return removed ? { ...index, total: Math.max(0, index.total - removed), tracks } : index;
}

/** Liked tracks whose primary artist is the given one, newest first. */
export function tracksByArtist(index: LikedIndex, artistId: string): LikedTrack[] {
  return index.tracks.filter((track) => track.a === artistId);
}
