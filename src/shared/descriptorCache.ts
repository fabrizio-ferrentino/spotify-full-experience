// Local cache of the liked songs' descriptors (genres and moods, the data behind the desktop
// app's Liked Songs chips). Built by the page, stored by the content script under the same
// hashed per-user key as the liked songs index. Catalog data only: concept IDs, their display
// names and classes, and which concepts each track has.

export interface DescriptorConcept {
  /** Display name, in the language of `DescriptorCache.lang`. */
  n: string;
  /** Classes of the concept (1 = genre, 2 = mood, others unknown). */
  c: number[];
}

export interface DescriptorCache {
  v: 1;
  /** Language the names were asked in (the page language). */
  lang: string;
  concepts: Record<string, DescriptorConcept>;
  /** Track ID → concept IDs (empty when the track has none). */
  tracks: Record<string, string[]>;
}

export const MAX_CACHE_TRACKS = 20_000;
const MAX_CONCEPTS = 5_000;
const MAX_PER_TRACK = 40;
const ID = /^[A-Za-z0-9]{22}$/;
const LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function descriptorStorageKeyFor(userKey: string): string {
  return `descriptors:${userKey}`;
}

/** Tolerant validator: anything malformed is dropped; null when the shape is wrong. */
export function parseDescriptorCache(value: unknown): DescriptorCache | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record['v'] !== 1 || typeof record['lang'] !== 'string' || !LANG.test(record['lang'])) return null;
  const rawConcepts = record['concepts'];
  const rawTracks = record['tracks'];
  if (typeof rawConcepts !== 'object' || rawConcepts === null || typeof rawTracks !== 'object' || rawTracks === null) return null;
  const concepts: Record<string, DescriptorConcept> = {};
  for (const [id, concept] of Object.entries(rawConcepts as Record<string, unknown>).slice(0, MAX_CONCEPTS)) {
    if (!ID.test(id) || typeof concept !== 'object' || concept === null) continue;
    const { n, c } = concept as Record<string, unknown>;
    if (typeof n !== 'string' || !n || !Array.isArray(c)) continue;
    concepts[id] = { n: n.slice(0, 100), c: c.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 256).slice(0, 8) };
  }
  const tracks: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(rawTracks as Record<string, unknown>).slice(0, MAX_CACHE_TRACKS)) {
    if (!ID.test(id) || !Array.isArray(list)) continue;
    tracks[id] = list.filter((x): x is string => typeof x === 'string' && x in concepts).slice(0, MAX_PER_TRACK);
  }
  return { v: 1, lang: record['lang'], concepts, tracks };
}
