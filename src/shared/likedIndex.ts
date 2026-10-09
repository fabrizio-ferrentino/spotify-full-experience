// Local index of the user's liked songs, shared by the page (builds it) and the content script
// (stores it in storage.local). Only what the artist card needs: track, primary artist, date
// added, title and album name. Never the user's ID: the storage key is a hash of it.

export interface LikedTrack {
  /** Track ID (base62). */
  t: string;
  /** Primary artist ID, or null when the track has none (local files, podcasts). */
  a: string | null;
  /** Date added, epoch milliseconds. */
  d: number;
  /** Track title. */
  n: string;
  /** Album name. */
  al: string;
}

export interface LikedIndex {
  v: 1;
  /** When the index was last checked against the server (epoch ms). */
  checkedAt: number;
  /** Total number of liked songs reported by the server. */
  total: number;
  /** Newest first, as the server returns them. */
  tracks: LikedTrack[];
}

export const MAX_INDEX_TRACKS = 20_000;
const MAX_TEXT = 500;
const ID = /^[A-Za-z0-9]{22}$/;
/** Storage keys are hex SHA-256 digests of the profile URI. */
export const INDEX_KEY = /^[0-9a-f]{64}$/;

export function storageKeyFor(userKey: string): string {
  return `likedIndex:${userKey}`;
}

function parseTrack(value: unknown): LikedTrack | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
  if (typeof r['t'] !== 'string' || !ID.test(r['t'])) return null;
  if (r['a'] !== null && (typeof r['a'] !== 'string' || !ID.test(r['a']))) return null;
  if (typeof r['d'] !== 'number' || !Number.isFinite(r['d'])) return null;
  return { t: r['t'], a: r['a'] as string | null, d: r['d'], n: text(r['n']), al: text(r['al']) };
}

/** Strict validation: anything malformed is dropped as a whole (the index is then rebuilt). */
export function parseLikedIndex(value: unknown): LikedIndex | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (r['v'] !== 1 || !Array.isArray(r['tracks']) || r['tracks'].length > MAX_INDEX_TRACKS) return null;
  if (typeof r['checkedAt'] !== 'number' || !Number.isFinite(r['checkedAt'])) return null;
  if (typeof r['total'] !== 'number' || !Number.isInteger(r['total']) || r['total'] < 0) return null;
  const tracks: LikedTrack[] = [];
  for (const item of r['tracks']) {
    const track = parseTrack(item);
    if (!track) return null;
    tracks.push(track);
  }
  return { v: 1, checkedAt: r['checkedAt'], total: r['total'], tracks };
}
