// Operations and response shapes for the liked songs feature (docs/phase2-findings.md).
import type { LikedTrack } from '../../shared/likedIndex';

export const OPERATIONS = {
  libraryTracks: 'fetchLibraryTracks',
  profile: 'profileAttributes',
  artistOverview: 'queryArtistOverview',
  addToLibrary: 'addToLibrary',
  applyCurations: 'applyCurations',
  editablePlaylists: 'editablePlaylists',
  playlist: 'fetchPlaylist',
  playlistContents: 'fetchPlaylistContents',
} as const;

/** Largest page accepted by fetchPlaylistContents (checked live: 1000). */
export const PLAYLIST_PAGE_MAX = 1000;
const PLAYLIST_URI = /^spotify:playlist:[A-Za-z0-9]{22}$/;

/** Largest page accepted by fetchLibraryTracks (checked live: 1000). */
export const LIBRARY_PAGE_MAX = 1000;
/** Context of the liked songs in curation requests. */
export const LIKED_SONGS_CONTEXT = 'spotify:collection:tracks';
/** Page size of our editablePlaylists requests. */
export const EDITABLE_PAGE_SIZE = 50;

const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const ARTIST_URI = /^spotify:artist:([A-Za-z0-9]{22})$/;
const ALBUM_URI = /^spotify:album:([A-Za-z0-9]{22})$/;

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

/** Smallest https image of at least `min` px from a `sources` array, or null. */
function smallestImage(sources: unknown, min: number): string | null {
  if (!Array.isArray(sources)) return null;
  let best: string | null = null;
  let bestSize = Infinity;
  for (const source of sources) {
    const url = at(source, 'url');
    const width = Number(at(source, 'width'));
    if (typeof url !== 'string' || !url.startsWith('https://')) continue;
    const size = Number.isFinite(width) && width >= min ? width : 10_000;
    if (size < bestSize) {
      bestSize = size;
      best = url;
    }
  }
  return best;
}

export interface LibraryPage {
  total: number;
  /** Raw number of items in the page, tracks or not (for paging). */
  itemCount: number;
  tracks: LikedTrack[];
}

/**
 * A track entry from the `data` of a Track object, shared by the library and playlist pages.
 * Duration is `duration` in the library and `trackDuration` in playlists.
 */
export function trackFrom(id: string, added: number, data: unknown): LikedTrack {
  const artists = at(data, 'artists', 'items');
  const artistList = Array.isArray(artists) ? artists : [];
  const name = at(data, 'name');
  const album = at(data, 'albumOfTrack');
  const albumName = at(album, 'name');
  const duration = Number(at(data, 'duration', 'totalMilliseconds') ?? at(data, 'trackDuration', 'totalMilliseconds'));
  return {
    t: id,
    a: idOf(at(artistList[0], 'uri'), ARTIST_URI),
    d: added,
    n: typeof name === 'string' ? name : '',
    ar: artistList.map((artist) => at(artist, 'profile', 'name')).map((n) => (typeof n === 'string' ? n : '')),
    ad: artistList.map((artist) => idOf(at(artist, 'uri'), ARTIST_URI)),
    al: typeof albumName === 'string' ? albumName : '',
    ai: idOf(at(album, 'uri'), ALBUM_URI),
    c: smallestImage(at(album, 'coverArt', 'sources'), 40) ?? '',
    ms: Number.isFinite(duration) && duration >= 0 ? duration : 0,
    e: at(data, 'contentRating', 'label') === 'EXPLICIT',
  };
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
    tracks.push(trackFrom(id, added, at(item, 'track', 'data')));
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
  const imageUrl = smallestImage(at(artist, 'visuals', 'avatarImage', 'sources'), 64);
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

export interface EditablePlaylist {
  /** spotify:playlist:<id>, or spotify:collection:tracks for the liked songs. */
  uri: string;
  name: string;
  imageUrl: string | null;
  /** The playlist already contains the items asked about. */
  curates: boolean;
  liked: boolean;
}

export interface EditablePlaylistsPage {
  total: number;
  itemCount: number;
  playlists: EditablePlaylist[];
}

/**
 * `data` of editablePlaylists (variables `{ offset, limit, textFilter, uris }`, checked live on
 * 2026-10-10): `me.editablePlaylists { totalCount, items[] { curates, pinned, item { _uri,
 * data { __typename: PseudoPlaylist | Playlist, name, uri, image | images } } } }`. The liked
 * songs come first, as a PseudoPlaylist with `spotify:collection:tracks`.
 */
export function parseEditablePlaylists(data: unknown): EditablePlaylistsPage | null {
  const page = at(data, 'me', 'editablePlaylists');
  const total = at(page, 'totalCount');
  const items = at(page, 'items');
  if (typeof total !== 'number' || !Array.isArray(items)) return null;
  const playlists: EditablePlaylist[] = [];
  for (const item of items) {
    const data = at(item, 'item', 'data');
    const uri = at(item, 'item', '_uri') ?? at(data, 'uri');
    const name = at(data, 'name');
    if (typeof uri !== 'string' || typeof name !== 'string') continue;
    const liked = uri === LIKED_SONGS_CONTEXT;
    if (!liked && !/^spotify:playlist:[A-Za-z0-9]{22}$/.test(uri)) continue;
    const images = at(data, 'images', 'items');
    const sources = at(data, 'image', 'sources') ?? (Array.isArray(images) ? at(images[0], 'sources') : null);
    playlists.push({ uri, name, imageUrl: smallestImage(sources, 40), curates: at(item, 'curates') === true, liked });
  }
  return { total, itemCount: items.length, playlists };
}

/** `data` of applyCurations: one entry per item (`[{ data: { isCurated } }]`), null if unexpected. */
export function parseCurationResult(data: unknown): boolean {
  const results = at(data, 'applyCurations');
  return Array.isArray(results) && results.length > 0;
}

export type CurationType = 'CURATE' | 'UNCURATE';

/**
 * Variables of applyCurations, as the player sends them from its "saved in" dialog
 * (docs/phase0-findings.md): `{ input: { curations: [{ contextUri, curationType }], itemUris } }`.
 */
export function curationVariables(
  itemUris: string[],
  curations: { contextUri: string; curationType: CurationType }[],
): Record<string, unknown> {
  return { input: { curations: curations.map(({ contextUri, curationType }) => ({ contextUri, curationType })), itemUris } };
}

/** A playlist row: the track plus the row ID (`uid`, a track can appear twice). */
export type PlaylistTrack = LikedTrack & { u: string };

export interface PlaylistPage {
  uri: string;
  offset: number;
  total: number;
  /** Raw items in order; null for rows that are not tracks (episodes, local files...). */
  items: (PlaylistTrack | null)[];
  /** Playlist revision, only in fetchPlaylist responses. */
  revision: string | null;
}

/**
 * Request variables and `data` of fetchPlaylist / fetchPlaylistContents (checked live on
 * 2026-10-10): variables `{ uri, offset, limit, ... }`; `playlistV2 { revisionId?, content {
 * totalCount, pagingInfo { offset, limit }, items[] { uid, addedAt.isoString, itemV2 {
 * __typename: TrackResponseWrapper, data: Track } } } }`.
 */
export function parsePlaylistPage(variables: unknown, data: unknown): PlaylistPage | null {
  const uri = at(variables, 'uri');
  const playlist = at(data, 'playlistV2');
  const content = at(playlist, 'content');
  const total = at(content, 'totalCount');
  const items = at(content, 'items');
  const offset = at(content, 'pagingInfo', 'offset') ?? at(variables, 'offset');
  if (typeof uri !== 'string' || !PLAYLIST_URI.test(uri) || typeof total !== 'number' || !Array.isArray(items)) return null;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) return null;
  const revision = at(playlist, 'revisionId');
  return {
    uri,
    offset,
    total,
    revision: typeof revision === 'string' ? revision : null,
    items: items.map((item) => {
      const data = at(item, 'itemV2', 'data');
      const id = idOf(at(data, 'uri'), TRACK_URI);
      const uid = at(item, 'uid');
      if (!id || at(data, '__typename') !== 'Track' || typeof uid !== 'string') return null;
      const added = Date.parse(String(at(item, 'addedAt', 'isoString') ?? ''));
      return { ...trackFrom(id, Number.isFinite(added) ? added : 0, data), u: uid };
    }),
  };
}
