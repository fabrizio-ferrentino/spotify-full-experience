// Which genre and mood chips to show over a list, like the desktop app's Liked Songs chips.
// The desktop's choice comes from Spotify's backend and is not reachable from the web (see
// docs/phase2-findings.md); this rule comes close on a real library (10 of 15 chips equal):
// the most frequent genres and moods, skipping one whose songs are mostly covered by a chip
// already chosen, so that the chips stay varied.
import type { DescriptorCache } from '../../../shared/descriptorCache';

export interface Chip {
  concept: string;
  name: string;
  trackIds: ReadonlySet<string>;
}

const GENRE = 1;
const MOOD = 2;
export const GENRE_CHIPS = 8;
export const MOOD_CHIPS = 7;
/** A chip needs this share of the list's songs, and at least MIN_TRACKS of them. */
const MIN_SHARE = 0.01;
const MIN_TRACKS = 3;
/** Skipped when this share of its songs already belongs to a chosen chip of the same kind. */
const OVERLAP = 0.7;

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return a.size ? shared / a.size : 1;
}

export function pickChips(trackIds: readonly string[], cache: DescriptorCache): Chip[] {
  const sets = new Map<string, Set<string>>();
  for (const id of trackIds) {
    for (const concept of cache.tracks[id] ?? []) {
      let set = sets.get(concept);
      if (!set) sets.set(concept, (set = new Set()));
      set.add(id);
    }
  }
  const minimum = Math.max(MIN_TRACKS, Math.ceil(trackIds.length * MIN_SHARE));
  const choose = (kind: number, count: number): Chip[] => {
    const candidates = [...sets]
      .filter(([concept, set]) => set.size >= minimum && cache.concepts[concept]?.c[0] === kind)
      .sort(([a, x], [b, y]) => y.size - x.size || cache.concepts[a]!.n.localeCompare(cache.concepts[b]!.n));
    const chosen: Chip[] = [];
    for (const [concept, set] of candidates) {
      if (chosen.length >= count) break;
      if (chosen.some((chip) => overlap(set, chip.trackIds) >= OVERLAP)) continue;
      chosen.push({ concept, name: cache.concepts[concept]!.n, trackIds: set });
    }
    return chosen;
  };
  const genres = choose(GENRE, GENRE_CHIPS);
  const moods = choose(MOOD, MOOD_CHIPS);
  // Genres and moods alternate, as they do on the desktop row.
  const out: Chip[] = [];
  for (let i = 0; i < Math.max(genres.length, moods.length); i += 1) {
    if (genres[i]) out.push(genres[i]!);
    if (moods[i]) out.push(moods[i]!);
  }
  return out;
}
