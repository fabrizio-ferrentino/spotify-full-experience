// Search and sort of a track list, like the desktop app's "search in playlist" and "sort by".
import type { ListTrack, SortKey, SortState } from '../../ui/trackList';

/** Lower case, without accents, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every word of the query appears in the title, the artists or the album. */
export function matches(track: ListTrack, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize(`${track.n} ${track.ar.join(' ')} ${track.al}`);
  return words.every((word) => haystack.includes(word));
}

/** Direction used when a sort is first chosen (newest first for the date added). */
export function defaultDescending(key: SortKey): boolean {
  return key === 'added';
}

/** Next sort after choosing `key`: same key flips the direction, another key starts fresh. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (key === 'custom') return { key, descending: false };
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: defaultDescending(key) };
}

/**
 * Filters and sorts; `tracks` is in the playlist's own order, which breaks ties and is the
 * "custom order". Never changes the input array.
 */
export function queryTracks(tracks: readonly ListTrack[], query: string, sort: SortState, lang: string): ListTrack[] {
  const filtered = tracks.filter((track) => matches(track, query));
  if (sort.key === 'custom') return sort.descending ? filtered.reverse() : filtered;
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
  } catch {
    collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  }
  const text = (a: string, b: string) => collator.compare(a, b);
  const compare: Record<Exclude<SortKey, 'custom'>, (a: ListTrack, b: ListTrack) => number> = {
    title: (a, b) => text(a.n, b.n),
    artist: (a, b) => text(a.ar[0] ?? '', b.ar[0] ?? '') || text(a.al, b.al),
    album: (a, b) => text(a.al, b.al),
    added: (a, b) => a.d - b.d,
    duration: (a, b) => a.ms - b.ms,
  };
  const order = new Map(tracks.map((track, i) => [track, i]));
  const by = compare[sort.key];
  const sign = sort.descending ? -1 : 1;
  return filtered.sort((a, b) => sign * by(a, b) || order.get(a)! - order.get(b)!);
}
