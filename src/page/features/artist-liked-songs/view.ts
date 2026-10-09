// "Brani che ti piacciono di <artist>" view, like the desktop app's page. It is a panel laid
// over the player's main view (same box, fixed to the viewport), appended to <body>: the
// player's own DOM is never changed. Back button, Escape, the artist's name or any navigation
// close it. Titles, artists and albums open their pages inside the app, where playback uses the
// player's controls; the "…" button and right click open a small menu of our own.
import type { LikedTrack } from '../../../shared/likedIndex';
import { albumPath, artistPath, navigateTo, trackPath, trackShareUrl } from '../../adapters/spotifyNav';
import { setText } from '../../core/dom';
import { addedDate, formatDuration, likedCountText, likedPageTitle, viewLabels } from '../../ui/format';
import { ContextMenu, type MenuItem } from './menu';
import { ACCENT, el, ELLIPSIS, HOVER, icon, ICONS, type Typography } from './typography';

const OWN = 'data-sfe-liked-view';
const PADDING = 24;
const COLUMNS =
  'display: grid; grid-template-columns: 24px minmax(0, 4fr) minmax(0, 2fr) minmax(0, 2fr) minmax(48px, 1fr) 32px; column-gap: 16px; align-items: center; padding: 0 8px 0 16px';
const SELECTED = 'data-sfe-selected';
const SELECTED_BACKGROUND = 'rgba(255, 255, 255, 0.2)';
const MORE = 'M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm6.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z';

export interface ViewModel {
  artistId: string;
  artistName: string;
  imageUrl: string | null;
  tracks: LikedTrack[];
  now: number;
}

export class LikedSongsView {
  readonly root: HTMLElement;
  private readonly barTitle: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly menu: ContextMenu;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };
  private readonly onResize = () => this.place();
  private renderedKey = '';
  private artistId = '';

  constructor(
    /** The player's main view: the panel covers exactly its box. */
    private readonly anchor: HTMLElement,
    private readonly typography: Typography,
    private readonly onClose: () => void,
    /** Double click on a row (default: open the track page, which the player starts). */
    private readonly onPlay: (track: LikedTrack) => void = (track) => navigateTo(trackPath(track.t)),
  ) {
    this.menu = new ContextMenu(typography.title);
    this.root = el(
      'section',
      'position: fixed; z-index: 20; overflow-y: auto; border-radius: 8px; color: var(--text-base, #fff); background: linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0) 280px), var(--background-base, #121212)',
    );
    this.root.setAttribute(OWN, '');
    this.root.setAttribute('role', 'region');
    this.root.addEventListener('scroll', () => this.menu.close());
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;
    const labels = viewLabels();

    // Sticky bar: back button and title, like the player's top bar.
    const bar = el('div', `position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 16px; height: 64px; padding: 0 ${PADDING}px; background: var(--background-base, #121212)`);
    const back = el(
      'button',
      'flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.6); color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer',
    );
    back.type = 'button';
    back.setAttribute('aria-label', labels.back);
    back.append(icon(ICONS.back, 16));
    back.addEventListener('click', () => this.close());
    this.barTitle = el('span', `${ELLIPSIS}; font-weight: 700; font-size: 20px`, typography.title);
    bar.append(back, this.barTitle);

    // Header: artist picture with the heart badge, big title, count.
    const header = el('div', `display: flex; align-items: flex-end; gap: 24px; padding: 16px ${PADDING}px 24px`);
    this.picture = el('div', 'position: relative; flex: 0 0 120px; width: 120px; height: 120px');
    const text = el('div', 'display: flex; flex-direction: column; gap: 8px; min-width: 0');
    this.title = el('h1', 'margin: 0; font-size: clamp(24px, 4vw, 40px); line-height: 1.15; font-weight: 900; overflow-wrap: anywhere', typography.heading);
    this.count = el('span', typography.subdued);
    text.append(this.title, this.count);
    header.append(this.picture, text);

    // Track list with a sticky column header.
    const head = el('div', `${COLUMNS}; ${typography.subdued}; position: sticky; top: 64px; z-index: 1; height: 36px; margin: 0 ${PADDING}px 8px; background: var(--background-base, #121212); border-bottom: 1px solid rgba(255,255,255,0.1)`);
    const cells = ['#', labels.title, labels.album, labels.added].map((label, i) => {
      const cell = el('span', i === 0 ? 'text-align: end' : ELLIPSIS);
      cell.textContent = label;
      return cell;
    });
    const clock = el('span', 'justify-self: end; display: flex');
    clock.append(icon(ICONS.clock, 16));
    head.append(...cells, clock, el('span'));

    this.list = el('ol', `list-style: none; margin: 0; padding: 0 ${PADDING}px 32px`);
    this.root.append(bar, header, head, this.list);
  }

  get isOpen(): boolean {
    return this.root.isConnected;
  }

  open(model: ViewModel): void {
    if (!this.isOpen) {
      document.body.append(this.root);
      document.addEventListener('keydown', this.onKey);
      window.addEventListener('resize', this.onResize);
      this.resizeObserver?.observe(this.anchor);
      this.place();
    }
    this.update(model);
    this.root.scrollTop = 0;
  }

  /** Removes the panel; the player's page underneath was never touched. Safe to call twice. */
  close(): void {
    this.menu.close();
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    if (!this.root.isConnected) return;
    this.root.remove();
    this.onClose();
  }

  /** Same box as the player's main view. */
  private place(): void {
    const box = this.anchor.getBoundingClientRect();
    Object.assign(this.root.style, { top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` });
  }

  update(model: ViewModel): void {
    this.artistId = model.artistId;
    const pageTitle = likedPageTitle(model.artistName);
    setText(this.barTitle, pageTitle);
    this.renderTitle(pageTitle, model.artistName);
    setText(this.count, likedCountText(model.tracks.length));
    this.renderPicture(model.imageUrl);
    const key = model.tracks.map((track) => track.t).join(',');
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.list.replaceChildren(...model.tracks.map((track, i) => this.row(track, i + 1, model.now)));
  }

  /** "Brani che ti piacciono di <artist>", the name links back to the artist page. */
  private renderTitle(pageTitle: string, artistName: string): void {
    if (this.title.dataset['text'] === pageTitle) return;
    this.title.dataset['text'] = pageTitle;
    const at = pageTitle.lastIndexOf(artistName);
    if (at < 0 || !artistName) {
      this.title.textContent = pageTitle;
      return;
    }
    const name = this.link(artistPath(this.artistId), 'color: inherit', () => this.close());
    name.textContent = artistName;
    this.title.replaceChildren(pageTitle.slice(0, at), name, pageTitle.slice(at + artistName.length));
  }

  /**
   * In-app link. Plain clicks run `onClick` (default: navigate inside the app); modified clicks
   * (new tab...) keep the browser behaviour.
   */
  private link(path: string, style: string, onClick: () => void = () => navigateTo(path), className = ''): HTMLAnchorElement {
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

  /** The artist of this view closes the view (its page is underneath); others navigate. */
  private artistLink(id: string, name: string): HTMLAnchorElement {
    const link = this.link(artistPath(id), '', id === this.artistId ? () => this.close() : undefined);
    link.textContent = name;
    return link;
  }

  private renderPicture(url: string | null): void {
    if (this.picture.dataset['src'] === (url ?? '')) return;
    this.picture.dataset['src'] = url ?? '';
    const image = el('div', `width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.1); box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: ${ACCENT}`);
    if (url) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = url;
      img.alt = '';
      image.append(img);
    } else {
      image.append(icon(ICONS.heart, 40));
    }
    const badge = el('div', `position: absolute; right: 4px; bottom: 4px; width: 32px; height: 32px; border-radius: 50%; background: ${ACCENT}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px var(--background-base, #121212)`);
    badge.append(icon(ICONS.heart, 16));
    this.picture.replaceChildren(image, badge);
  }

  private menuItems(track: LikedTrack): MenuItem[] {
    const labels = viewLabels();
    const items: MenuItem[] = [];
    const artistId = track.ad[0] ?? track.a;
    if (artistId) items.push({ label: labels.goToArtist, action: () => (artistId === this.artistId ? this.close() : navigateTo(artistPath(artistId))) });
    if (track.ai) items.push({ label: labels.goToAlbum, action: () => navigateTo(albumPath(track.ai!)) });
    items.push({ label: labels.goToSong, action: () => navigateTo(trackPath(track.t)) });
    items.push({ label: labels.copyLink, action: () => void navigator.clipboard?.writeText(trackShareUrl(track.t)).catch(() => {}) });
    return items;
  }

  private row(track: LikedTrack, position: number, now: number): HTMLLIElement {
    const { title: titleClass, subdued } = this.typography;
    const row = el('li', `${COLUMNS}; height: 56px; border-radius: 4px`);

    const index = el('span', `${subdued}; text-align: end; font-variant-numeric: tabular-nums`);
    index.textContent = String(position);

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
    const title = this.link(trackPath(track.t), `${ELLIPSIS}; max-width: 100%`, undefined, titleClass);
    title.textContent = track.n || track.t;
    const line = el('div', `${subdued}; display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%`);
    if (track.e) {
      const badge = el('span', 'flex: 0 0 auto; font-size: 9px; font-weight: 700; line-height: 16px; padding: 0 5px; border-radius: 2px; background: rgba(255,255,255,0.6); color: #000');
      badge.textContent = 'E';
      badge.title = viewLabels().explicit;
      line.append(badge);
    }
    const artists = el('span', ELLIPSIS);
    track.ar.forEach((name, i) => {
      if (i > 0) artists.append(', ');
      const id = track.ad[i];
      artists.append(id ? this.artistLink(id, name) : name);
    });
    line.append(artists);
    text.append(title, line);
    main.append(cover, text);

    const album = track.ai ? this.link(albumPath(track.ai), `${subdued}; ${ELLIPSIS}`) : el('span', `${subdued}; ${ELLIPSIS}`);
    album.textContent = track.al;
    const added = el('span', `${subdued}; ${ELLIPSIS}`);
    added.textContent = addedDate(track.d, now);
    const duration = el('span', `${subdued}; justify-self: end; font-variant-numeric: tabular-nums`);
    duration.textContent = formatDuration(track.ms);

    // "…" button: visible on hover or focus, like the player's rows.
    const more = el('button', 'justify-self: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0');
    more.type = 'button';
    more.setAttribute('aria-label', viewLabels().more(track.n));
    more.setAttribute('aria-haspopup', 'menu');
    more.append(icon(MORE, 16));
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const box = more.getBoundingClientRect();
      this.menu.open(this.menuItems(track), box.right - 240, box.bottom + 4);
    });
    more.addEventListener('focus', () => (more.style.opacity = '1'));
    more.addEventListener('blur', () => (more.style.opacity = row.matches(':hover') ? '1' : '0'));

    const paint = () => {
      const selected = row.hasAttribute(SELECTED);
      row.style.background = selected ? SELECTED_BACKGROUND : row.matches(':hover') ? HOVER : 'transparent';
    };
    row.addEventListener('mouseenter', () => {
      paint();
      more.style.opacity = '1';
    });
    row.addEventListener('mouseleave', () => {
      paint();
      if (document.activeElement !== more) more.style.opacity = '0';
    });
    // Like the player's rows: a click selects, a double click plays (see onPlay).
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
      this.onPlay(track);
    });
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.menu.open(this.menuItems(track), event.clientX, event.clientY);
    });

    row.append(index, main, album, added, duration, more);
    return row;
  }
}
