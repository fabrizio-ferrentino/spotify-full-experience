// Local index of the user's liked songs, shared by the page (builds it) and the content script
// (stores it in storage.local). Only what the artist section and its page need: catalog data
// of each liked track and the date it was added. Never the user's ID: the storage key is a hash.

export interface LikedTrack {
  /** Track ID (base62). */
  t: string;
  /** Primary artist ID, or null when the track has none. */
  a: string | null;
  /** Date added, epoch milliseconds. */
  d: number;
  /** Track title. */
  n: string;
  /** All artist names, primary first. */
  ar: string[];
  /** Album name and ID. */
  al: string;
  ai: string | null;
  /** Small cover URL (https), or empty. */
  c: string;
  /** Duration in milliseconds (0 if unknown). */
  ms: number;
  /** Explicit content. */
  e: boolean;
}

export interface LikedIndex {
  v: 2;
  /** When the index was last checked against the server (epoch ms). */
  checkedAt: number;
  /** Total number of liked songs reported by the server. */
  total: number;
  /** Newest first, as the server returns them. */
  tracks: LikedTrack[];
}

export const MAX_INDEX_TRACKS = 20_000;
const MAX_TEXT = 500;
const MAX_ARTISTS = 20;
const ID = /^[A-Za-z0-9]{22}$/;
/** Storage keys are hex SHA-256 digests of the profile URI. */
export const INDEX_KEY = /^[0-9a-f]{64}$/;

export function storageKeyFor(userKey: string): string {
  return `likedIndex:${userKey}`;
}

const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');

function optionalId(v: unknown): string | null | undefined {
  if (v === null) return null;
  return typeof v === 'string' && ID.test(v) ? v : undefined;
}

function parseTrack(value: unknown): LikedTrack | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r['t'] !== 'string' || !ID.test(r['t'])) return null;
  const artist = optionalId(r['a']);
  const album = optionalId(r['ai']);
  if (artist === undefined || album === undefined) return null;
  if (typeof r['d'] !== 'number' || !Number.isFinite(r['d'])) return null;
  const cover = text(r['c']);
  return {
    t: r['t'],
    a: artist,
    d: r['d'],
    n: text(r['n']),
    ar: Array.isArray(r['ar']) ? r['ar'].slice(0, MAX_ARTISTS).map(text) : [],
    al: text(r['al']),
    ai: album,
    c: cover.startsWith('https://') ? cover : '',
    ms: typeof r['ms'] === 'number' && Number.isFinite(r['ms']) && r['ms'] >= 0 ? r['ms'] : 0,
    e: r['e'] === true,
  };
}

/** Strict validation: anything malformed (or an older format) is dropped and rebuilt. */
export function parseLikedIndex(value: unknown): LikedIndex | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (r['v'] !== 2 || !Array.isArray(r['tracks']) || r['tracks'].length > MAX_INDEX_TRACKS) return null;
  if (typeof r['checkedAt'] !== 'number' || !Number.isFinite(r['checkedAt'])) return null;
  if (typeof r['total'] !== 'number' || !Number.isInteger(r['total']) || r['total'] < 0) return null;
  const tracks: LikedTrack[] = [];
  for (const item of r['tracks']) {
    const track = parseTrack(item);
    if (!track) return null;
    tracks.push(track);
  }
  return { v: 2, checkedAt: r['checkedAt'], total: r['total'], tracks };
}
