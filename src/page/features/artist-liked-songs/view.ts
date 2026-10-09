// "Brani che ti piacciono di <artist>" view, like the desktop app's page: it takes the place of
// the artist page content (hidden, not removed) until the user goes back, presses Escape or
// navigates. Titles, artists and albums open their pages inside the app, where playback uses
// the player's own controls.
import type { LikedTrack } from '../../../shared/likedIndex';
import { navigateTo, trackPath } from '../../adapters/spotifyNav';
import { setText } from '../../core/dom';
import { addedDate, columnLabels, formatDuration, likedCountText, likedPageTitle } from '../../ui/format';
import { el, hoverable, icon, ICONS, type Typography } from './typography';

const OWN = 'data-sfe-liked-view';
const COLUMNS = 'grid-template-columns: 24px minmax(0, 4fr) minmax(0, 2fr) minmax(0, 2fr) minmax(56px, 1fr); column-gap: 16px';

export interface ViewModel {
  artistName: string;
  tracks: LikedTrack[];
  now: number;
}

function inAppLink(path: string, className: string, style: string): HTMLAnchorElement {
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
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly list: HTMLOListElement;
  private hiddenDisplay: string | null = null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };
  private renderedKey = '';

  constructor(
    private readonly page: HTMLElement,
    private readonly typography: Typography,
    private readonly onClose: () => void,
    inset: number,
  ) {
    this.root = el('section', `padding: 16px ${inset}px 32px`);
    this.root.setAttribute(OWN, '');

    const header = el('div', 'display: flex; align-items: center; gap: 16px; margin-bottom: 8px');
    const back = el(
      'button',
      'flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.6); color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer',
    );
    back.type = 'button';
    back.setAttribute('aria-label', columnLabels().back);
    back.append(icon(ICONS.back, 16));
    back.addEventListener('click', () => this.close());
    this.title = el('h2', 'margin: 0', typography.heading);
    header.append(back, this.title);
    this.count = el('div', 'margin: 0 0 24px 48px', typography.subdued);

    const labels = columnLabels();
    const head = el('div', `display: grid; ${COLUMNS}; align-items: center; height: 36px; padding: 0 16px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1)`, typography.subdued);
    const cells = ['#', labels.title, labels.album, labels.added].map((label, i) => {
      const cell = el('span', i === 0 ? 'text-align: end' : 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
      cell.textContent = label;
      return cell;
    });
    const clock = el('span', 'justify-self: end; display: flex');
    clock.append(icon(ICONS.clock, 16));
    head.append(...cells, clock);

    this.list = el('ol', 'list-style: none; margin: 0; padding: 0');
    this.root.append(header, this.count, head, this.list);
  }

  get isOpen(): boolean {
    return this.root.isConnected;
  }

  /** Hides the artist page content and shows the view in its place. */
  open(model: ViewModel): void {
    if (this.isOpen) return this.update(model);
    this.hiddenDisplay = this.page.style.display;
    this.page.style.display = 'none';
    this.page.before(this.root);
    this.update(model);
    this.root.scrollIntoView({ block: 'start' });
    document.addEventListener('keydown', this.onKey);
  }

  /** Removes the view and shows the artist page again. Safe to call twice. */
  close(): void {
    document.removeEventListener('keydown', this.onKey);
    if (this.hiddenDisplay !== null) {
      this.page.style.display = this.hiddenDisplay;
      this.hiddenDisplay = null;
    }
    if (!this.root.isConnected) return;
    this.root.remove();
    this.onClose();
  }

  update(model: ViewModel): void {
    setText(this.title, likedPageTitle(model.artistName));
    setText(this.count, likedCountText(model.tracks.length));
    const key = model.tracks.map((track) => track.t).join(',');
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.list.replaceChildren(...model.tracks.map((track, i) => this.row(track, i + 1, model.now)));
  }

  private row(track: LikedTrack, position: number, now: number): HTMLLIElement {
    const { title: titleClass, subdued } = this.typography;
    const row = el('li', `display: grid; ${COLUMNS}; align-items: center; height: 56px; padding: 0 16px; border-radius: 4px`);
    hoverable(row);

    const index = el('span', 'text-align: end; font-variant-numeric: tabular-nums', subdued);
    index.textContent = String(position);

    const main = el('div', 'display: flex; align-items: center; gap: 12px; min-width: 0');
    if (track.c) {
      const cover = el('img', 'flex: 0 0 40px; width: 40px; height: 40px; border-radius: 4px; object-fit: cover');
      cover.src = track.c;
      cover.alt = '';
      cover.loading = 'lazy';
      main.append(cover);
    }
    const text = el('div', 'display: flex; flex-direction: column; min-width: 0');
    const title = inAppLink(trackPath(track.t), titleClass, 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
    title.textContent = track.n || track.t;
    const line = el('div', 'display: flex; align-items: center; gap: 6px; min-width: 0', subdued);
    if (track.e) {
      const badge = el('span', 'flex: 0 0 auto; font-size: 9px; line-height: 16px; padding: 0 5px; border-radius: 2px; background: rgba(255,255,255,0.6); color: #000');
      badge.textContent = 'E';
      badge.title = columnLabels().explicit;
      line.append(badge);
    }
    const artists = el('span', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
    artists.textContent = track.ar.join(', ');
    line.append(artists);
    text.append(title, line);
    main.append(text);

    const album = track.ai
      ? inAppLink(`/album/${track.ai}`, subdued, 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
      : el('span', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis', subdued);
    album.textContent = track.al;

    const added = el('span', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis', subdued);
    added.textContent = addedDate(track.d, now);
    const duration = el('span', 'justify-self: end; font-variant-numeric: tabular-nums', subdued);
    duration.textContent = formatDuration(track.ms);

    row.append(index, main, album, added, duration);
    return row;
  }
}
