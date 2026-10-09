// "Cosa ti è piaciuto" section under the artist's Popular block, like the desktop app: the
// artist's round picture with a heart badge, "17 brani" and "Di <artist>". A click opens the
// liked songs view (view.ts).
import { setText } from '../../core/dom';
import { byArtistText, likedCountText, likedSectionTitle } from '../../ui/format';
import { ACCENT, borrowTypography, el, hoverable, icon, ICONS, type Typography } from './typography';

const OWN = 'data-sfe-liked';
const PICTURE_SIZE = 88;

export interface CardModel {
  artistName: string;
  imageUrl: string | null;
  count: number;
}

export class LikedSongsCard {
  readonly root: HTMLElement;
  readonly typography: Typography;
  private readonly heading: HTMLHeadingElement;
  private readonly image: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;

  constructor(
    readonly block: HTMLElement,
    onOpen: () => void,
  ) {
    this.typography = borrowTypography(block);
    // The Popular block's parent is a grid of cards: span the whole row.
    this.root = el('section', 'margin-top: 32px; grid-column: 1 / -1');
    this.root.setAttribute(OWN, '');
    this.heading = el('h2', 'margin: 0 0 16px', this.typography.heading);

    const button = el(
      'button',
      // Like the player's cards: generous padding, rounded corners, a soft highlight on hover.
      'display: flex; align-items: center; gap: 16px; padding: 12px 24px 12px 12px; margin-inline-start: -12px; border: 0; border-radius: 8px; background: transparent; color: inherit; text-align: start; cursor: pointer; font: inherit; max-width: 100%; transition: background-color 0.2s',
    );
    button.type = 'button';
    hoverable(button);
    button.addEventListener('click', onOpen);

    this.image = el('div', `position: relative; flex: 0 0 ${PICTURE_SIZE}px; width: ${PICTURE_SIZE}px; height: ${PICTURE_SIZE}px`);
    // Short texts on one line, never cut (an ellipsis made the button shrink-wrap too narrow).
    const text = el('div', 'display: flex; flex-direction: column; gap: 4px; flex: 0 0 auto');
    this.title = el('span', 'display: block; white-space: nowrap; font-weight: 700', this.typography.title);
    this.subtitle = el('span', `${this.typography.subdued}; display: block; white-space: nowrap`);
    text.append(this.title, this.subtitle);
    button.append(this.image, text);
    this.root.append(this.heading, button);
  }

  /** Inserts the section after the Popular block (idempotent). */
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
    setText(this.heading, likedSectionTitle());
    setText(this.title, likedCountText(model.count));
    setText(this.subtitle, byArtistText(model.artistName));
    this.renderImage(model.imageUrl);
  }

  private renderImage(url: string | null): void {
    if (this.image.dataset['src'] === (url ?? '')) return;
    this.image.dataset['src'] = url ?? '';
    this.image.replaceChildren();
    const picture = el(
      'div',
      `width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: ${ACCENT}`,
    );
    if (url) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      picture.append(img);
    } else {
      picture.append(icon(ICONS.heart, 32));
    }
    const badge = el(
      'div',
      `position: absolute; right: 2px; bottom: 2px; width: 24px; height: 24px; border-radius: 50%; background: ${ACCENT}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--background-base, #121212)`,
    );
    badge.append(icon(ICONS.heart, 13));
    this.image.append(picture, badge);
  }
}
