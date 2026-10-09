// "Cosa ti è piaciuto" section under the artist's Popular block, like the desktop app: the
// artist's round picture with a heart badge, "17 brani" and "Di <artist>", with an expandable
// list of those songs. Each title opens the track page in the app, where playback
// uses the player's own controls (works with free accounts too).
import type { LikedTrack } from '../../../shared/likedIndex';
import { SELECTORS } from '../../adapters/spotifyDom';
import { navigateTo, trackPath } from '../../adapters/spotifyNav';
import { setText } from '../../core/dom';
import { byArtistText, likedCountText, likedSectionTitle, relativeTime } from '../../ui/format';

const OWN = 'data-sfe-liked';
const DURATION_TEXT = /^\d+:\d{2}$/;
const HOVER = 'rgba(255, 255, 255, 0.07)';
const ACCENT = 'var(--essential-bright-accent, #1ed760)';
const PICTURE_SIZE = 88;

export interface CardModel {
  artistName: string;
  imageUrl: string | null;
  tracks: LikedTrack[];
  now: number;
}

/** Classes borrowed from the Popular block, so the section follows the player's typography. */
interface BorrowedClasses {
  heading: string;
  title: string;
  subdued: string;
}

function borrowClasses(block: HTMLElement): BorrowedClasses {
  const heading = [...block.children].find((child) => child.tagName === 'H2')?.className ?? '';
  const row = block.querySelector(SELECTORS.trackRow);
  const title = row?.querySelector(`${SELECTORS.trackLink} div`)?.className ?? '';
  const subdued =
    [...(row?.querySelectorAll('*') ?? [])].find(
      (el) => el.children.length === 0 && DURATION_TEXT.test(el.textContent?.trim() ?? ''),
    )?.className ?? '';
  return { heading, title, subdued };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (className) node.className = className;
  return node;
}

function svg(path: string, size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size));
  icon.setAttribute('aria-hidden', 'true');
  icon.style.fill = 'currentColor';
  const shape = document.createElementNS(ns, 'path');
  shape.setAttribute('d', path);
  icon.append(shape);
  return icon;
}

const HEART = 'M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.5 4.6.5c1.3 0 2.5.6 3.4 1.5C8.9 1.1 10.1.5 11.4.5c2.3 0 4.1 1.8 4.1 4.1 0 2.8-2.5 5.1-6.4 8.6z';
const CHEVRON = 'M14 6 8 12 2 6l1.1-1.1L8 9.8l4.9-4.9z';

function hoverable(node: HTMLElement): void {
  node.addEventListener('mouseenter', () => (node.style.background = HOVER));
  node.addEventListener('mouseleave', () => (node.style.background = 'transparent'));
}

export class LikedSongsCard {
  readonly root: HTMLElement;
  private readonly classes: BorrowedClasses;
  private readonly heading: HTMLHeadingElement;
  private readonly header: HTMLButtonElement;
  private readonly image: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly chevron: SVGSVGElement;
  private readonly list: HTMLOListElement;
  private expanded = false;
  private model: CardModel | null = null;

  constructor(private readonly block: HTMLElement) {
    this.classes = borrowClasses(block);
    this.root = el('section', 'margin-top: 32px');
    this.root.setAttribute(OWN, '');
    this.heading = el('h2', 'margin: 0 0 16px', this.classes.heading);

    this.header = el('button', 'display: flex; align-items: center; gap: 16px; width: 100%; padding: 8px; margin-inline-start: -8px; border: 0; border-radius: 6px; background: transparent; color: inherit; text-align: start; cursor: pointer; font: inherit');
    this.header.type = 'button';
    this.header.setAttribute('aria-expanded', 'false');
    hoverable(this.header);
    this.header.addEventListener('click', () => this.toggle());

    this.image = el('div', `position: relative; flex: 0 0 ${PICTURE_SIZE}px; width: ${PICTURE_SIZE}px; height: ${PICTURE_SIZE}px`);
    const text = el('div', 'display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto');
    this.title = el('span', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700', this.classes.title);
    this.subtitle = el('span', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis', this.classes.subdued);
    text.append(this.title, this.subtitle);
    this.chevron = svg(CHEVRON, 16);
    this.chevron.style.cssText += '; flex: 0 0 auto; opacity: 0.7; transition: transform 0.2s';
    this.header.append(this.image, text, this.chevron);

    this.list = el('ol', 'list-style: none; margin: 4px 0 0; padding: 0; max-height: 420px; overflow-y: auto');
    this.list.hidden = true;
    this.root.append(this.heading, this.header, this.list);
  }

  /** Inserts the card after the Popular block (idempotent). */
  mount(): void {
    if (this.block.nextElementSibling !== this.root) this.block.after(this.root);
  }

  get mounted(): boolean {
    return this.root.isConnected && this.block.isConnected;
  }

  remove(): void {
    this.root.remove();
  }

  update(model: CardModel): void {
    const sameTracks =
      this.model?.tracks.length === model.tracks.length && this.model.tracks.every((t, i) => t.t === model.tracks[i]?.t);
    this.model = model;
    setText(this.heading, likedSectionTitle());
    setText(this.title, likedCountText(model.tracks.length));
    setText(this.subtitle, byArtistText(model.artistName));
    this.renderImage(model.imageUrl);
    if (!sameTracks && this.expanded) this.renderList();
  }

  private renderImage(url: string | null): void {
    if (this.image.dataset['src'] === (url ?? '')) return;
    this.image.dataset['src'] = url ?? '';
    this.image.replaceChildren();
    const picture = el('div', `width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: ${ACCENT}`);
    if (url) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      picture.append(img);
    } else {
      picture.append(svg(HEART, 24));
    }
    const badge = el('div', `position: absolute; right: 2px; bottom: 2px; width: 24px; height: 24px; border-radius: 50%; background: ${ACCENT}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--background-base, #121212)`);
    badge.append(svg(HEART, 13));
    this.image.append(picture, badge);
  }

  private toggle(): void {
    this.expanded = !this.expanded;
    this.header.setAttribute('aria-expanded', String(this.expanded));
    this.chevron.style.transform = this.expanded ? 'rotate(180deg)' : '';
    this.list.hidden = !this.expanded;
    if (this.expanded) this.renderList();
  }

  private renderList(): void {
    const model = this.model;
    if (!model) return;
    const rows = model.tracks.map((track) => {
      const row = el('li', 'display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) auto; gap: 16px; align-items: center; padding: 8px 16px; border-radius: 4px');
      hoverable(row);
      const link = el('a', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: inherit; text-decoration: none', this.classes.title);
      link.href = trackPath(track.t);
      link.textContent = track.n || track.t;
      link.addEventListener('click', (event) => {
        // Plain clicks stay in the app; modified clicks (new tab...) keep the browser behaviour.
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateTo(trackPath(track.t));
      });
      const album = el('span', 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis', this.classes.subdued);
      album.textContent = track.al;
      const added = el('span', 'white-space: nowrap', this.classes.subdued);
      added.textContent = relativeTime(track.d, model.now);
      row.append(link, album, added);
      return row;
    });
    this.list.replaceChildren(...rows);
  }
}
