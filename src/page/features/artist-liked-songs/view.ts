// "Brani che ti piacciono di <artist>" view, like the desktop app's page. It is a panel laid
// over the player's main view (same position and size, fixed to the viewport), appended to
// <body>: the player's own DOM is never changed. Back button, Escape or any navigation close it.
// Titles and albums open their pages inside the app, where playback uses the player's controls.
import type { LikedTrack } from '../../../shared/likedIndex';
import { navigateTo, trackPath } from '../../adapters/spotifyNav';
import { setText } from '../../core/dom';
import { addedDate, columnLabels, formatDuration, likedCountText, likedPageTitle } from '../../ui/format';
import { ACCENT, el, ELLIPSIS, hoverable, icon, ICONS, type Typography } from './typography';

const OWN = 'data-sfe-liked-view';
const PADDING = 24;
const COLUMNS =
  'display: grid; grid-template-columns: 24px minmax(0, 4fr) minmax(0, 2fr) minmax(0, 2fr) minmax(56px, 1fr); column-gap: 16px; align-items: center; padding: 0 16px';

export interface ViewModel {
  artistName: string;
  imageUrl: string | null;
  tracks: LikedTrack[];
  now: number;
}

function inAppLink(path: string, style: string, className = ''): HTMLAnchorElement {
  const link = el('a', `color: inherit; text-decoration: none; ${style}`, className);
  link.href = path;
  link.addEventListener('click', (event) => {
    // Plain clicks stay in the app; modified clicks (new tab...) keep the browser behaviour.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(path);
  });
  link.addEventListener('mouseenter', () => (link.style.textDecoration = 'underline'));
  link.addEventListener('mouseleave', () => (link.style.textDecoration = 'none'));
  return link;
}

export class LikedSongsView {
  readonly root: HTMLElement;
  private readonly barTitle: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };
  private readonly onResize = () => this.place();
  private renderedKey = '';

  constructor(
    /** The player's main view: the panel covers exactly its box. */
    private readonly anchor: HTMLElement,
    private readonly typography: Typography,
    private readonly onClose: () => void,
  ) {
    this.root = el(
      'section',
      'position: fixed; z-index: 20; overflow-y: auto; border-radius: 8px; color: var(--text-base, #fff); background: linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0) 280px), var(--background-base, #121212)',
    );
    this.root.setAttribute(OWN, '');
    this.root.setAttribute('role', 'region');
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;

    // Sticky bar: back button and title, like the player's top bar.
    const bar = el('div', `position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 16px; height: 64px; padding: 0 ${PADDING}px; background: var(--background-base, #121212)`);
    const back = el(
      'button',
      'flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.6); color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer',
    );
    back.type = 'button';
    back.setAttribute('aria-label', columnLabels().back);
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
    const labels = columnLabels();
    const head = el('div', `${COLUMNS}; ${typography.subdued}; position: sticky; top: 64px; z-index: 1; height: 36px; margin: 0 ${PADDING}px 8px; background: var(--background-base, #121212); border-bottom: 1px solid rgba(255,255,255,0.1)`);
    const cells = ['#', labels.title, labels.album, labels.added].map((label, i) => {
      const cell = el('span', i === 0 ? 'text-align: end' : ELLIPSIS);
      cell.textContent = label;
      return cell;
    });
    const clock = el('span', 'justify-self: end; display: flex');
    clock.append(icon(ICONS.clock, 16));
    head.append(...cells, clock);

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
    Object.assign(this.root.style, {
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
  }

  update(model: ViewModel): void {
    const pageTitle = likedPageTitle(model.artistName);
    setText(this.barTitle, pageTitle);
    setText(this.title, pageTitle);
    setText(this.count, likedCountText(model.tracks.length));
    this.renderPicture(model.imageUrl);
    const key = model.tracks.map((track) => track.t).join(',');
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.list.replaceChildren(...model.tracks.map((track, i) => this.row(track, i + 1, model.now)));
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

  private row(track: LikedTrack, position: number, now: number): HTMLLIElement {
    const { title: titleClass, subdued } = this.typography;
    const row = el('li', `${COLUMNS}; height: 56px; border-radius: 4px`);
    hoverable(row);

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
    const text = el('div', 'display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto');
    const title = inAppLink(trackPath(track.t), ELLIPSIS, titleClass);
    title.textContent = track.n || track.t;
    const line = el('div', `${subdued}; display: flex; align-items: center; gap: 6px; min-width: 0`);
    if (track.e) {
      const badge = el('span', 'flex: 0 0 auto; font-size: 9px; font-weight: 700; line-height: 16px; padding: 0 5px; border-radius: 2px; background: rgba(255,255,255,0.6); color: #000');
      badge.textContent = 'E';
      badge.title = columnLabels().explicit;
      line.append(badge);
    }
    const artists = el('span', ELLIPSIS);
    artists.textContent = track.ar.join(', ');
    line.append(artists);
    text.append(title, line);
    main.append(cover, text);

    const album = track.ai ? inAppLink(`/album/${track.ai}`, `${subdued}; ${ELLIPSIS}`) : el('span', `${subdued}; ${ELLIPSIS}`);
    album.textContent = track.al;
    const added = el('span', `${subdued}; ${ELLIPSIS}`);
    added.textContent = addedDate(track.d, now);
    const duration = el('span', `${subdued}; justify-self: end; font-variant-numeric: tabular-nums`);
    duration.textContent = formatDuration(track.ms);

    row.append(index, main, album, added, duration);
    return row;
  }
}
