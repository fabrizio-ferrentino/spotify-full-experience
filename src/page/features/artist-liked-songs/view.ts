// "Brani che ti piacciono di <artist>" view, like the desktop app's page. It is a panel laid
// over the player's main view (same box, fixed to the viewport), appended to <body>: the
// player's own DOM is never changed. Back button, Escape, the artist's name or any navigation
// close it. The rows are the shared desktop-like track list (ui/trackList).
import { artistPath } from '../../adapters/spotifyNav';
import { setText } from '../../core/dom';
import { likedCountText, likedPageTitle, viewLabels } from '../../ui/format';
import { appLink, ROUND_BUTTON, TrackList, type ListTrack, type RowActions } from '../../ui/trackList';
import { ACCENT, el, ELLIPSIS, icon, ICONS, type Typography } from '../../ui/typography';

export type { RowActions } from '../../ui/trackList';

const OWN = 'data-sfe-liked-view';
const PADDING = 24;

export interface ViewModel {
  artistId: string;
  artistName: string;
  imageUrl: string | null;
  tracks: ListTrack[];
  now: number;
}

export class LikedSongsView {
  readonly root: HTMLElement;
  private readonly barTitle: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly trackList: TrackList;
  private tracks: ListTrack[] = [];
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };
  private readonly onResize = () => this.place();
  private artistId = '';

  constructor(
    /** The player's main view: the panel covers exactly its box. */
    private readonly anchor: HTMLElement,
    typography: Typography,
    private readonly onClose: () => void,
    private readonly actions: Partial<RowActions> = {},
  ) {
    this.trackList = new TrackList({ typography, actions, stickyTop: 64, padding: PADDING, onCurrentArtist: () => this.close() });
    this.root = el(
      'section',
      'position: fixed; z-index: 20; overflow-y: auto; border-radius: 8px; color: var(--text-base, #fff); background: linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0) 280px), var(--background-base, #121212)',
    );
    this.root.setAttribute(OWN, '');
    this.root.setAttribute('role', 'region');
    this.root.addEventListener('scroll', () => this.trackList.closePopups());
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
    // Big green play: the artist's liked songs from the first one, like the desktop app.
    const playAll = el('button', `${ROUND_BUTTON}; flex: 0 0 48px; width: 48px; height: 48px; background: ${ACCENT}; color: #000`);
    playAll.type = 'button';
    playAll.setAttribute('aria-label', labels.play(''));
    playAll.append(icon(ICONS.play, 20));
    playAll.addEventListener('click', () => {
      const first = this.tracks[0];
      if (first) this.actions.play?.(first);
    });
    playAll.addEventListener('mouseenter', () => (playAll.style.transform = 'scale(1.04)'));
    playAll.addEventListener('mouseleave', () => (playAll.style.transform = ''));
    this.barTitle = el('span', `${ELLIPSIS}; font-weight: 700; font-size: 20px`, typography.title);
    bar.append(back, playAll, this.barTitle);

    // Header: artist picture with the heart badge, big title, count.
    const header = el('div', `display: flex; align-items: flex-end; gap: 24px; padding: 16px ${PADDING}px 24px`);
    this.picture = el('div', 'position: relative; flex: 0 0 120px; width: 120px; height: 120px');
    const text = el('div', 'display: flex; flex-direction: column; gap: 8px; min-width: 0');
    this.title = el('h1', 'margin: 0; font-size: clamp(24px, 4vw, 40px); line-height: 1.15; font-weight: 900; overflow-wrap: anywhere', typography.heading);
    this.count = el('span', typography.subdued);
    text.append(this.title, this.count);
    header.append(this.picture, text);

    this.root.append(bar, header, this.trackList.head, this.trackList.list);
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
    this.trackList.closePopups();
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
    this.trackList.setCurrentArtist(model.artistId);
    const pageTitle = likedPageTitle(model.artistName);
    setText(this.barTitle, pageTitle);
    this.renderTitle(pageTitle, model.artistName);
    setText(this.count, likedCountText(model.tracks.length));
    this.tracks = model.tracks;
    this.renderPicture(model.imageUrl);
    this.trackList.render(model.tracks, model.now);
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
    const name = appLink(artistPath(this.artistId), 'color: inherit', () => this.close());
    name.textContent = artistName;
    this.title.replaceChildren(pageTitle.slice(0, at), name, pageTitle.slice(at + artistName.length));
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
}
