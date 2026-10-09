// Operations and response shapes for the liked songs feature (docs/phase2-findings.md).
import type { LikedTrack } from '../../shared/likedIndex';

export const OPERATIONS = {
  libraryTracks: 'fetchLibraryTracks',
  profile: 'profileAttributes',
  artistOverview: 'queryArtistOverview',
  addToLibrary: 'addToLibrary',
  applyCurations: 'applyCurations',
} as const;

/** Largest page accepted by fetchLibraryTracks (checked live: 1000). */
export const LIBRARY_PAGE_MAX = 1000;
/** Context of the liked songs in curation requests. */
const LIKED_SONGS_CONTEXT = 'spotify:collection:tracks';

const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const ARTIST_URI = /^spotify:artist:([A-Za-z0-9]{22})$/;

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function at(value: unknown, ...path: string[]): unknown {
  let node: unknown = value;
  for (const key of path) node = obj(node)?.[key];
  return node;
}

function idOf(uri: unknown, pattern: RegExp): string | null {
  return typeof uri === 'string' ? (pattern.exec(uri)?.[1] ?? null) : null;
}

export interface LibraryPage {
  total: number;
  /** Raw number of items in the page, tracks or not (for paging). */
  itemCount: number;
  tracks: LikedTrack[];
}

/** `data` of fetchLibraryTracks → page of liked tracks (items that are not tracks are skipped). */
export function parseLibraryPage(data: unknown): LibraryPage | null {
  const page = at(data, 'me', 'library', 'tracks');
  const total = at(page, 'totalCount');
  const items = at(page, 'items');
  if (typeof total !== 'number' || !Array.isArray(items)) return null;
  const tracks: LikedTrack[] = [];
  for (const item of items) {
    const id = idOf(at(item, 'track', '_uri'), TRACK_URI);
    const added = Date.parse(String(at(item, 'addedAt', 'isoString') ?? ''));
    if (!id || !Number.isFinite(added)) continue;
    const data = at(item, 'track', 'data');
    const artists = at(data, 'artists', 'items');
    const primary = Array.isArray(artists) ? idOf(at(artists[0], 'uri'), ARTIST_URI) : null;
    const name = at(data, 'name');
    const album = at(data, 'albumOfTrack', 'name');
    tracks.push({ t: id, a: primary, d: added, n: typeof name === 'string' ? name : '', al: typeof album === 'string' ? album : '' });
  }
  return { total, itemCount: items.length, tracks };
}

/** Response JSON of profileAttributes → the profile URI (used only to derive a hashed key). */
export function parseProfileUri(json: unknown): string | null {
  const uri = at(json, 'data', 'me', 'profile', 'uri');
  return typeof uri === 'string' && uri.length > 0 ? uri : null;
}

export interface ArtistInfo {
  id: string;
  name: string;
  /** Smallest avatar of at least 64 px, or null. */
  imageUrl: string | null;
}

/** Response JSON of queryArtistOverview → name and avatar of the artist. */
export function parseArtistOverview(json: unknown): ArtistInfo | null {
  const artist = at(json, 'data', 'artistUnion');
  const id = idOf(at(artist, 'uri'), ARTIST_URI);
  const name = at(artist, 'profile', 'name');
  if (!id || typeof name !== 'string') return null;
  const sources = at(artist, 'visuals', 'avatarImage', 'sources');
  let imageUrl: string | null = null;
  let best = Infinity;
  if (Array.isArray(sources)) {
    for (const source of sources) {
      const url = at(source, 'url');
      const width = Number(at(source, 'width'));
      if (typeof url !== 'string' || !url.startsWith('https://')) continue;
      const size = Number.isFinite(width) && width >= 64 ? width : 10_000;
      if (size < best) {
        best = size;
        imageUrl = url;
      }
    }
  }
  return { id, name, imageUrl };
}

export type LibraryChange = { kind: 'added' | 'removed'; trackIds: string[] };

/** Library writes made by the player, from the request of addToLibrary / applyCurations. */
export function parseLibraryChange(operationName: string | null, variables: unknown): LibraryChange | null {
  const ids = (uris: unknown) =>
    Array.isArray(uris) ? uris.map((uri) => idOf(uri, TRACK_URI)).filter((id): id is string => id !== null) : [];
  if (operationName === OPERATIONS.addToLibrary) {
    const trackIds = ids(at(variables, 'libraryItemUris'));
    return trackIds.length ? { kind: 'added', trackIds } : null;
  }
  if (operationName === OPERATIONS.applyCurations) {
    const input = at(variables, 'input');
    const curations = at(input, 'curations');
    const liked = Array.isArray(curations)
      ? curations.find((curation) => at(curation, 'contextUri') === LIKED_SONGS_CONTEXT)
      : undefined;
    const trackIds = ids(at(input, 'itemUris'));
    if (!liked || !trackIds.length) return null;
    // UNCURATE observed live; CURATE assumed to be its opposite (adding through the same dialog).
    const type = at(liked, 'curationType');
    if (type === 'UNCURATE') return { kind: 'removed', trackIds };
    if (type === 'CURATE') return { kind: 'added', trackIds };
  }
  return null;
}
