// Track list with desktop-like rows, shared by our views: ▶ in place of the number, a tick
// that opens "Save in", a "…" menu (also on right click), click to select, double click to
// play. Column headers can sort the list. The host appends `head` and `list` where it wants
// them; menus and dialogs are owned here.
import type { LikedTrack } from '../../shared/likedIndex';
import { LIKED_SONGS_CONTEXT, type EditablePlaylist } from '../adapters/libraryShapes';
import { albumPath, artistPath, navigateTo, trackPath, trackShareUrl } from '../adapters/spotifyNav';
import { addedDate, formatCount, formatDuration, label, viewLabels } from './format';
import { ContextMenu, type MenuItem } from './menu';
import { SaveDialog, type CurationChange } from './saveDialog';
import { showToast } from './toast';
import { ACCENT, addIcon, checkIcon, el, ELLIPSIS, HOVER, icon, ICONS, type Typography } from './typography';

/**
 * A row: a liked songs index entry, with the row ID when it comes from a playlist or an album,
 * and the play count on albums (null when unknown).
 */
export type ListTrack = LikedTrack & { u?: string; p?: number | null };

export type SortKey = 'custom' | 'title' | 'artist' | 'album' | 'added' | 'duration' | 'plays';

/** Columns: `library` (title, album, date added) or `album` (title, plays; no covers, like album pages). */
export type ListLayout = 'library' | 'album';
export interface SortState {
  key: SortKey;
  descending: boolean;
}

/** What the rows can do; actions left out are not offered. */
export interface RowActions {
  /** Double click, ▶ (default: open the track page, which the player starts). */
  play(track: ListTrack): void;
  /** Adds the track to the player's queue; false on failure. */
  queue(track: ListTrack): Promise<boolean>;
  /** The liked songs and the editable playlists, with `curates` for this track. */
  playlists(track: ListTrack): Promise<EditablePlaylist[]>;
  /** Saves or removes the track in the given contexts; false on failure. */
  curate(track: ListTrack, changes: CurationChange[]): Promise<boolean>;
}

export interface TrackListOptions {
  typography: Typography;
  actions: Partial<RowActions>;
  /** Whether a track is in the liked songs (tick and menu entry). Default: always. */
  isLiked?: (track: ListTrack) => boolean;
  /** Links to this artist run `onCurrentArtist` instead of navigating. */
  currentArtistId?: string;
  onCurrentArtist?: () => void;
  /** Distance of the sticky header from the top of the scrolling box. */
  stickyTop: number;
  /** Horizontal margin of header and list. */
  padding: number;
  background?: string;
  /** Header clicks ask for this sort (no sorting by header when absent). */
  onSort?: (key: SortKey) => void;
  /** Default: `library`. */
  layout?: ListLayout;
}

export const COLUMNS =
  'display: grid; grid-template-columns: 24px minmax(0, 4fr) minmax(0, 2fr) minmax(0, 2fr) minmax(88px, 1fr) 32px; column-gap: 16px; align-items: center; padding: 0 8px 0 16px';
const SELECTED = 'data-sfe-selected';
const SELECTED_BACKGROUND = 'rgba(255, 255, 255, 0.2)';
export const ROUND_BUTTON =
  'border: 0; border-radius: 50%; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0';
const MORE = 'M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm6.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z';
const ALBUM_COLUMNS =
  'display: grid; grid-template-columns: 24px minmax(0, 4fr) minmax(120px, 1fr) minmax(88px, 1fr) 32px; column-gap: 16px; align-items: center; padding: 0 8px 0 16px';
/** Sort asked by each header cell, in column order. */
const HEADER_SORT: Record<ListLayout, readonly (SortKey | null)[]> = {
  library: ['custom', 'title', 'album', 'added', 'duration', null],
  album: ['custom', 'title', 'plays', 'duration', null],
};

const MARK = 'background: #2e77d0; color: #fff; border-radius: 2px';

/** Folds a character like the search does: lower case, no accents. */
function fold(char: string): string {
  return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

/**
 * `text` with the words of `query` highlighted (case and accents ignored), as the desktop app
 * shows search results. Plain text when there is nothing to highlight.
 */
export function highlighted(text: string, query: string): Node {
  const words = query.split(/\s+/).map((word) => [...word].map(fold).join('')).filter(Boolean);
  if (!words.length || !text) return document.createTextNode(text);
  // Folded text with, for each folded character, the index of its source character.
  const chars = [...text];
  let folded = '';
  const source: number[] = [];
  chars.forEach((char, i) => {
    for (const part of fold(char)) {
      folded += part;
      source.push(i);
    }
  });
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const word of words) {
    for (let at = folded.indexOf(word); at >= 0; at = folded.indexOf(word, at + word.length)) {
      for (let k = at; k < at + word.length; k += 1) marked[source[k]!] = true;
    }
  }
  if (!marked.includes(true)) return document.createTextNode(text);
  const fragment = document.createDocumentFragment();
  let i = 0;
  while (i < chars.length) {
    const on = marked[i];
    let j = i;
    while (j < chars.length && marked[j] === on) j += 1;
    const piece = chars.slice(i, j).join('');
    if (on) {
      const mark = el('span', MARK);
      mark.textContent = piece;
      fragment.append(mark);
    } else fragment.append(piece);
    i = j;
  }
  return fragment;
}

function copyText(text: string): Promise<boolean> {
  return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true) : Promise.resolve(false);
}

/**
 * In-app link. Plain clicks run `onClick` (default: navigate inside the app); modified clicks
 * (new tab...) keep the browser behaviour.
 */
export function appLink(path: string, style: string, onClick: () => void = () => navigateTo(path), className = ''): HTMLAnchorElement {
  const link = el('a', `color: inherit; text-decoration: none; ${style}`, className);
  link.href = path;
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onClick();
  });
  link.addEventListener('mouseenter', () => (link.style.textDecoration = 'underline'));
  link.addEventListener('mouseleave', () => (link.style.textDecoration = 'none'));
  return link;
}

export class TrackList {
  readonly head: HTMLElement;
  readonly list: HTMLOListElement;
  private readonly menu: ContextMenu;
  private readonly saveDialog: SaveDialog;
  private readonly headerCells: HTMLElement[] = [];
  private renderedKey = '';
  private highlight = '';
  private readonly layout: ListLayout;
  private readonly columns: string;

  constructor(private readonly options: TrackListOptions) {
    const { typography, stickyTop, padding } = options;
    this.layout = options.layout ?? 'library';
    this.columns = this.layout === 'album' ? ALBUM_COLUMNS : COLUMNS;
    const background = options.background ?? 'var(--background-base, #121212)';
    this.menu = new ContextMenu(typography.title);
    this.saveDialog = new SaveDialog(typography.title);
    const labels = viewLabels();

    this.head = el(
      'div',
      `${this.columns}; ${typography.subdued}; position: sticky; top: ${stickyTop}px; z-index: 1; height: 36px; margin: 0 ${padding}px 8px; background: ${background}; border-bottom: 1px solid rgba(255,255,255,0.1)`,
    );
    const titles = this.layout === 'album' ? ['#', labels.title, label('playcounts')] : ['#', labels.title, labels.album, labels.added];
    const cells = titles.map((text, i) => {
      const cell = el('span', i === 0 ? 'display: flex; justify-content: flex-end; align-items: center; gap: 4px' : `${ELLIPSIS}; display: flex; align-items: center; gap: 4px`);
      const span = el('span', i === 0 ? '' : ELLIPSIS);
      span.textContent = text;
      cell.append(span);
      return cell;
    });
    const clock = el('span', 'justify-self: end; display: flex; align-items: center; gap: 4px');
    clock.append(icon(ICONS.clock, 16));
    this.headerCells.push(...cells, clock);
    this.head.append(...cells, clock, el('span'));
    if (options.onSort) {
      this.headerCells.forEach((cell, i) => {
        const key = HEADER_SORT[this.layout][i];
        if (!key) return;
        cell.style.cursor = 'pointer';
        cell.setAttribute('role', 'button');
        cell.tabIndex = 0;
        cell.addEventListener('click', () => options.onSort!(key));
        cell.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            options.onSort!(key);
          }
        });
        cell.addEventListener('mouseenter', () => (cell.style.color = 'var(--text-base, #fff)'));
        cell.addEventListener('mouseleave', () => (cell.style.color = ''));
      });
    }

    this.list = el('ol', `list-style: none; margin: 0; padding: 0 ${padding}px 32px`);
  }

  /** Shows which column the list is sorted by (a green caret, like the desktop app). */
  showSort(sort: SortState): void {
    this.headerCells.forEach((cell, i) => {
      cell.querySelector('[data-sfe-sort]')?.remove();
      if (HEADER_SORT[this.layout][i] !== sort.key || sort.key === 'custom') return;
      const caret = el('span', `display: flex; color: ${ACCENT}`);
      caret.setAttribute('data-sfe-sort', '');
      caret.append(icon(sort.descending ? ICONS.caretDown : ICONS.caretUp, 12));
      if (i === this.headerCells.length - 1) cell.prepend(caret);
      else cell.append(caret);
    });
  }

  /** Shows `tracks`; `highlight` is the search text to mark in titles, artists and albums. */
  render(tracks: ListTrack[], now: number, highlight = ''): void {
    const key = `${highlight}\n${tracks.map((track) => track.u ?? track.t).join(',')}`;
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.highlight = highlight;
    this.list.replaceChildren(...tracks.map((track, i) => this.row(track, i + 1, now)));
  }

  /** Links to this artist run `onCurrentArtist` (the artist whose page is underneath). */
  setCurrentArtist(id: string): void {
    this.options.currentArtistId = id;
  }

  /** Forces the next render to rebuild the rows (e.g. the liked state changed). */
  invalidate(): void {
    this.renderedKey = '';
  }

  closePopups(): void {
    this.menu.close();
    this.saveDialog.close();
  }

  private isLiked(track: ListTrack): boolean {
    return this.options.isLiked ? this.options.isLiked(track) : true;
  }

  private play(track: ListTrack): void {
    if (this.options.actions.play) this.options.actions.play(track);
    else navigateTo(trackPath(track.t));
  }

  /** Runs a library or player action and reports the outcome in a toast. */
  private report(action: Promise<boolean>, success: string): void {
    void action.catch(() => false).then((ok) => showToast(ok ? success : viewLabels().failed, this.options.typography.title));
  }

  private openSaveDialog(track: ListTrack, anchor: HTMLElement): void {
    const { playlists, curate } = this.options.actions;
    if (!playlists || !curate) return;
    this.menu.close();
    this.saveDialog.open(
      anchor,
      () => playlists(track),
      (changes) => this.report(curate(track, changes), viewLabels().saved),
      () => showToast(viewLabels().failed, this.options.typography.title),
    );
  }

  private artistLink(id: string, name: string): HTMLAnchorElement {
    const { currentArtistId, onCurrentArtist } = this.options;
    const link = appLink(artistPath(id), '', id === currentArtistId && onCurrentArtist ? onCurrentArtist : undefined);
    link.replaceChildren(highlighted(name, this.highlight));
    return link;
  }

  private menuItems(track: ListTrack): MenuItem[] {
    const labels = viewLabels();
    const { queue, playlists, curate } = this.options.actions;
    const items: MenuItem[] = [];
    if (playlists && curate) {
      items.push({
        label: labels.addToPlaylist,
        icon: () => icon(ICONS.plus, 16),
        submenu: {
          search: labels.findPlaylist,
          empty: labels.noPlaylists,
          items: async () =>
            (await playlists(track))
              .filter((playlist) => !playlist.liked)
              .map((playlist) => ({
                label: playlist.name,
                action: () =>
                  this.report(curate(track, [{ contextUri: playlist.uri, curationType: 'CURATE' }]), labels.addedTo(playlist.name)),
              })),
        },
      });
      items.push(
        this.isLiked(track)
          ? {
              label: labels.removeFromLiked,
              icon: () => checkIcon(16),
              action: () =>
                this.report(curate(track, [{ contextUri: LIKED_SONGS_CONTEXT, curationType: 'UNCURATE' }]), labels.removedFromLiked),
            }
          : {
              label: labels.saveToLiked,
              icon: () => addIcon(16),
              action: () => this.report(curate(track, [{ contextUri: LIKED_SONGS_CONTEXT, curationType: 'CURATE' }]), labels.savedToLiked),
            },
      );
    }
    if (queue) {
      items.push({ label: labels.addToQueue, icon: () => icon(ICONS.queue, 16), action: () => this.report(queue(track), labels.addedToQueue) });
    }
    const navigation: MenuItem[] = [];
    const artistId = track.ad[0] ?? track.a;
    if (artistId) {
      const { currentArtistId, onCurrentArtist } = this.options;
      navigation.push({
        label: labels.goToArtist,
        icon: () => icon(ICONS.artist, 16),
        action: () => (artistId === currentArtistId && onCurrentArtist ? onCurrentArtist() : navigateTo(artistPath(artistId))),
      });
    }
    if (track.ai) navigation.push({ label: labels.goToAlbum, icon: () => icon(ICONS.album, 16), action: () => navigateTo(albumPath(track.ai!)) });
    navigation.push({
      label: labels.share,
      icon: () => icon(ICONS.share, 16),
      submenu: {
        items: () => [
          {
            label: labels.copyLink,
            icon: () => icon(ICONS.link, 16),
            action: () => this.report(copyText(trackShareUrl(track.t)), labels.linkCopied),
          },
        ],
      },
    });
    if (items.length) navigation[0]!.separator = true;
    return [...items, ...navigation];
  }

  private row(track: ListTrack, position: number, now: number): HTMLLIElement {
    const { title: titleClass, subdued } = this.options.typography;
    const labels = viewLabels();
    const album = this.layout === 'album';
    const row = el('li', `${this.columns}; height: 56px; border-radius: 4px`);

    // Number, or ▶ while the row is hovered or focused.
    const index = el('span', `${subdued}; display: flex; justify-content: flex-end; align-items: center; font-variant-numeric: tabular-nums`);
    const number = el('span');
    number.textContent = String(position);
    const play = el('button', `${ROUND_BUTTON}; width: 24px; height: 24px; color: #fff; display: none`);
    play.type = 'button';
    play.setAttribute('aria-label', labels.play(track.n));
    play.append(icon(ICONS.play, 14));
    play.addEventListener('click', () => this.play(track));
    index.append(number, play);

    const main = el('div', 'display: flex; align-items: center; gap: 12px; min-width: 0');
    const cover = el('div', 'flex: 0 0 40px; width: 40px; height: 40px; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,0.1)');
    if (track.c) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = track.c;
      img.alt = '';
      img.loading = 'lazy';
      cover.append(img);
    }
    const text = el('div', 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; flex: 1 1 auto');
    const title = appLink(trackPath(track.t), `${ELLIPSIS}; max-width: 100%`, undefined, titleClass);
    title.replaceChildren(highlighted(track.n || track.t, this.highlight));
    const line = el('div', `${subdued}; display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%`);
    if (track.e) {
      const badge = el('span', 'flex: 0 0 auto; font-size: 9px; font-weight: 700; line-height: 16px; padding: 0 5px; border-radius: 2px; background: rgba(255,255,255,0.6); color: #000');
      badge.textContent = 'E';
      badge.title = labels.explicit;
      line.append(badge);
    }
    const artists = el('span', ELLIPSIS);
    track.ar.forEach((name, i) => {
      if (i > 0) artists.append(', ');
      const id = track.ad[i];
      artists.append(id ? this.artistLink(id, name) : highlighted(name, this.highlight));
    });
    line.append(artists);
    text.append(title, line);
    // Album pages show no covers: every row would have the same one.
    if (album) main.append(text);
    else main.append(cover, text);

    const middle: HTMLElement[] = [];
    if (album) {
      const plays = el('span', `${subdued}; ${ELLIPSIS}; font-variant-numeric: tabular-nums`);
      plays.textContent = typeof track.p === 'number' ? formatCount(track.p) : '';
      middle.push(plays);
    } else {
      const albumLink = track.ai ? appLink(albumPath(track.ai), `${subdued}; ${ELLIPSIS}`) : el('span', `${subdued}; ${ELLIPSIS}`);
      albumLink.replaceChildren(highlighted(track.al, this.highlight));
      const added = el('span', `${subdued}; ${ELLIPSIS}`);
      added.textContent = addedDate(track.d, now);
      middle.push(albumLink, added);
    }
    // Tick before the duration ("Save in"), shown on hover like on the desktop rows: green when
    // the track is in the liked songs, an empty "+" otherwise.
    const duration = el('span', `${subdued}; justify-self: end; display: flex; align-items: center; gap: 16px; font-variant-numeric: tabular-nums`);
    const time = el('span');
    time.textContent = formatDuration(track.ms);
    const saved = el('button', `${ROUND_BUTTON}; width: 24px; height: 24px; opacity: 0`);
    saved.type = 'button';
    saved.setAttribute('aria-label', labels.saveIn);
    saved.setAttribute('aria-haspopup', 'dialog');
    saved.append(this.isLiked(track) ? checkIcon(16) : addIcon(16));
    saved.addEventListener('click', (event) => {
      event.stopPropagation();
      this.openSaveDialog(track, saved);
    });
    if (this.options.actions.playlists && this.options.actions.curate) duration.append(saved);
    duration.append(time);

    // "…" button: visible on hover or focus, like the player's rows.
    const more = el('button', `${ROUND_BUTTON}; justify-self: center; width: 32px; height: 32px; opacity: 0`);
    more.type = 'button';
    more.setAttribute('aria-label', labels.more(track.n));
    more.setAttribute('aria-haspopup', 'menu');
    more.append(icon(MORE, 16));
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const box = more.getBoundingClientRect();
      this.menu.open(this.menuItems(track), box.right - 240, box.bottom + 4);
    });

    const paint = () => {
      const selected = row.hasAttribute(SELECTED);
      const active = row.matches(':hover') || row.contains(document.activeElement);
      row.style.background = selected ? SELECTED_BACKGROUND : active ? HOVER : 'transparent';
      for (const control of [saved, more]) control.style.opacity = active ? '1' : '0';
      number.style.display = active ? 'none' : '';
      play.style.display = active ? 'flex' : 'none';
    };
    row.addEventListener('mouseenter', paint);
    row.addEventListener('mouseleave', paint);
    row.addEventListener('focusin', paint);
    row.addEventListener('focusout', () => setTimeout(paint));
    // Like the player's rows: a click selects, a double click plays.
    const onRowControl = (event: Event) => (event.target as Element).closest('a, button') !== null;
    row.addEventListener('click', (event) => {
      if (onRowControl(event)) return;
      for (const other of this.list.querySelectorAll<HTMLElement>(`[${SELECTED}]`)) {
        other.removeAttribute(SELECTED);
        other.style.background = 'transparent';
      }
      row.setAttribute(SELECTED, '');
      paint();
    });
    row.addEventListener('dblclick', (event) => {
      if (onRowControl(event)) return;
      this.play(track);
    });
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.menu.open(this.menuItems(track), event.clientX, event.clientY);
    });

    row.append(index, main, ...middle, duration, more);
    return row;
  }
}
