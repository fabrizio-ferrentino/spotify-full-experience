// Typography borrowed from the artist's Popular block, so our section and view follow the
// player's fonts and colours without hardcoding its CSS. Headings and titles reuse the player's
// classes; for subdued text only the text properties are copied, because the class of the
// duration cell also carries layout (an end-aligned flex box) that truncates longer text.
import { SELECTORS } from '../../adapters/spotifyDom';

const DURATION_TEXT = /^\d+:\d{2}$/;
const TEXT_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color'] as const;
const FALLBACK_SUBDUED = 'color: var(--text-subdued, #b3b3b3); font-size: 14px';

export interface Typography {
  /** Class of the section heading ("Popolari"). */
  heading: string;
  /** Class of a track title in a row. */
  title: string;
  /** Inline text style of subdued text (the duration), without layout. */
  subdued: string;
}

export function borrowTypography(block: HTMLElement): Typography {
  const heading = [...block.children].find((child) => child.tagName === 'H2')?.className ?? '';
  const row = block.querySelector(SELECTORS.trackRow);
  const title = row?.querySelector(`${SELECTORS.trackLink} div`)?.className ?? '';
  const duration = [...(row?.querySelectorAll('*') ?? [])].find(
    (el) => el.children.length === 0 && DURATION_TEXT.test(el.textContent?.trim() ?? ''),
  );
  let subdued = FALLBACK_SUBDUED;
  if (duration) {
    const style = getComputedStyle(duration);
    const copied = TEXT_PROPERTIES.map((name) => [name, style.getPropertyValue(name)] as const).filter(([, value]) => value);
    if (copied.length) subdued = copied.map(([name, value]) => `${name}: ${value}`).join('; ');
  }
  return { heading, title, subdued };
}

export const HOVER = 'rgba(255, 255, 255, 0.07)';
export const ACCENT = 'var(--essential-bright-accent, #1ed760)';
/** Single-line text that ends with an ellipsis. */
export const ELLIPSIS = 'display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, style = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (className) node.className = className;
  return node;
}

export function hoverable(node: HTMLElement): void {
  node.addEventListener('mouseenter', () => (node.style.background = HOVER));
  node.addEventListener('mouseleave', () => (node.style.background = 'transparent'));
}

export function icon(path: string, size: number, viewBox = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBox} ${viewBox}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.fill = 'currentColor';
  svg.style.flex = '0 0 auto';
  const shape = document.createElementNS(ns, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

export const ICONS = {
  heart: 'M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.5 4.6.5c1.3 0 2.5.6 3.4 1.5C8.9 1.1 10.1.5 11.4.5c2.3 0 4.1 1.8 4.1 4.1 0 2.8-2.5 5.1-6.4 8.6z',
  back: 'M11.03.47a.75.75 0 0 1 0 1.06L4.56 8l6.47 6.47a.75.75 0 1 1-1.06 1.06L2.44 8 9.97.47a.75.75 0 0 1 1.06 0z',
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8.75-4.25V7.7l2.6 1.5-.75 1.3L7.25 8.6V3.75h1.5z',
} as const;
