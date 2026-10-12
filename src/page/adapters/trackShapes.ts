// Requests and response shapes behind the player's track menu entries that our lists add
// (checked live on 2026-10-12, see docs/phase2-findings.md): song radio, credits, taste profile.

/** spclient host the player uses for these requests. */
export const SPCLIENT_WG = 'https://spclient.wg.spotify.com';

const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
const PLAYLIST_URI = /^spotify:playlist:([A-Za-z0-9]{22})$/;
const ARTIST_URI = /^spotify:artist:([A-Za-z0-9]{22})$/;
const USER_URI = /^spotify:user:([^:\s]+)$/;

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function at(value: unknown, ...path: string[]): unknown {
  let node: unknown = value;
  for (const key of path) node = obj(node)?.[key];
  return node;
}

function trackUri(trackId: string): string {
  return `spotify:track:${trackId}`;
}

/** "Go to song radio": `GET …/inspiredby-mix/v2/seed_to_playlist/<track uri>?response-format=json`. */
export function songRadioUrl(trackId: string): string {
  return `${SPCLIENT_WG}/inspiredby-mix/v2/seed_to_playlist/${trackUri(trackId)}?response-format=json`;
}

/** `{ mediaItems[] { uri }, total }` → ID of the radio playlist, or null. */
export function parseSongRadio(json: unknown): string | null {
  const items = at(json, 'mediaItems');
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const id = PLAYLIST_URI.exec(String(at(item, 'uri') ?? ''))?.[1];
    if (id) return id;
  }
  return null;
}

/** Collection set of the tracks excluded from the taste profile. */
export const TASTE_PROFILE_SET = 'ignoreinrecs';

/** `POST …/collection/v2/<contains|write>?market=from_token`, JSON body. */
export function collectionUrl(operation: 'contains' | 'write'): string {
  return `${SPCLIENT_WG}/collection/v2/${operation}?market=from_token`;
}

/** The user name of `spotify:user:<name>` (memory only, like the profile URI). */
export function usernameOf(profileUri: string | null): string | null {
  return profileUri ? (USER_URI.exec(profileUri)?.[1] ?? null) : null;
}

/**
 * Body of the player's taste profile requests: `{ username, set: "ignoreinrecs", items: [{ uri }] }`
 * to check or exclude, with `is_removed: true` on the item to include the track again.
 */
export function tasteProfileBody(username: string, trackId: string, include = false): Json {
  return { username, set: TASTE_PROFILE_SET, items: [{ uri: trackUri(trackId), ...(include ? { is_removed: true } : {}) }] };
}

/** Response of `contains`: `{ found: [boolean] }`. */
export function parseContains(json: unknown): boolean | null {
  const found = at(json, 'found');
  return Array.isArray(found) && typeof found[0] === 'boolean' ? found[0] : null;
}

/** Pathfinder query of the player's credits dialog, with the player's own variables. */
export const CREDITS_OPERATION = 'queryTrackCreditsGroupedModal';

export function creditsVariables(trackId: string): Record<string, unknown> {
  return { trackUri: trackUri(trackId), contributorsLimit: 100, contributorsOffset: 0 };
}

export interface CreditPerson {
  name: string;
  role: string;
  /** Artist page to link to, when the person is a Spotify artist. */
  artistId: string | null;
}

export interface TrackCredits {
  title: string;
  /** Role groups in the response order ("Artist", "Composition & Lyrics"...). */
  groups: { name: string; people: CreditPerson[] }[];
  /** Who provided the credits (labels, publishers). */
  sources: string[];
}

/**
 * `data` of queryTrackCreditsGroupedModal: `trackUnion { name, creditsTrait { contributors {
 * items[] { name, role, roleGroup { name }, uri } }, sources { items[] { name } } } }`.
 */
export function parseCredits(data: unknown): TrackCredits | null {
  const track = at(data, 'trackUnion');
  const title = at(track, 'name');
  const contributors = at(track, 'creditsTrait', 'contributors', 'items');
  if (typeof title !== 'string' || !Array.isArray(contributors)) return null;
  const groups: TrackCredits['groups'] = [];
  for (const item of contributors) {
    const name = at(item, 'name');
    if (typeof name !== 'string' || !name) continue;
    const role = at(item, 'role');
    const groupName = at(item, 'roleGroup', 'name');
    const label = typeof groupName === 'string' ? groupName : '';
    let group = groups.find((g) => g.name === label);
    if (!group) groups.push((group = { name: label, people: [] }));
    group.people.push({
      name,
      role: typeof role === 'string' ? role : '',
      artistId: ARTIST_URI.exec(String(at(item, 'uri') ?? ''))?.[1] ?? null,
    });
  }
  const sourceItems = at(track, 'creditsTrait', 'sources', 'items');
  const sources = Array.isArray(sourceItems)
    ? sourceItems.map((source) => at(source, 'name')).filter((name): name is string => typeof name === 'string' && name !== '')
    : [];
  return { title, groups, sources };
}

/** "Open in Desktop app": the track's `spotify:` link, opened by the desktop app. */
export function desktopUri(trackId: string): string {
  return TRACK_URI.test(trackUri(trackId)) ? trackUri(trackId) : '';
}
