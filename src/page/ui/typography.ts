// Typography borrowed from the artist's Popular block, so our section and view follow the
// player's fonts and colours without hardcoding its CSS. Headings and titles reuse the player's
// classes; for subdued text only the text properties are copied, because the class of the
// duration cell also carries layout (an end-aligned flex box) that truncates longer text.
import { SELECTORS } from '../adapters/spotifyDom';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(path: string, size: number, viewBox = 16): SVGSVGElement {
  const ns = SVG_NS;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBox} ${viewBox}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.fill = 'currentColor';
  svg.style.flex = '0 0 auto';
  const shape = document.createElementNS(ns, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill-rule', 'evenodd');
  svg.append(shape);
  return svg;
}

/** Filled accent circle with a dark tick: "saved", as on the desktop rows. */
export function checkIcon(size: number): SVGSVGElement {
  const svg = icon('', size);
  svg.replaceChildren();
  const circle = document.createElementNS(SVG_NS, 'circle');
  Object.entries({ cx: '8', cy: '8', r: '8' }).forEach(([name, value]) => circle.setAttribute(name, value));
  circle.style.fill = ACCENT;
  const tick = document.createElementNS(SVG_NS, 'path');
  tick.setAttribute('d', 'M4.5 8.2 7 10.6l4.6-5');
  Object.entries({ fill: 'none', stroke: '#000', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }).forEach(
    ([name, value]) => tick.setAttribute(name, value),
  );
  tick.style.fill = 'none';
  svg.append(circle, tick);
  return svg;
}

/** Outlined circle with a plus: "save", on rows of tracks that are not in the liked songs. */
export function addIcon(size: number): SVGSVGElement {
  return icon('M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.25-3.75h1.5v3h3v1.5h-3v3h-1.5v-3h-3v-1.5h3z', size);
}

/** Empty circle: "not saved here", in the "save in" dialog. */
export function emptyCircleIcon(size: number): SVGSVGElement {
  return icon('M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z', size);
}

export const ICONS = {
  heart: 'M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.5 4.6.5c1.3 0 2.5.6 3.4 1.5C8.9 1.1 10.1.5 11.4.5c2.3 0 4.1 1.8 4.1 4.1 0 2.8-2.5 5.1-6.4 8.6z',
  back: 'M11.03.47a.75.75 0 0 1 0 1.06L4.56 8l6.47 6.47a.75.75 0 1 1-1.06 1.06L2.44 8 9.97.47a.75.75 0 0 1 1.06 0z',
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8.75-4.25V7.7l2.6 1.5-.75 1.3L7.25 8.6V3.75h1.5z',
  play: 'M3.5 1.9v12.2a.6.6 0 0 0 .9.52l10.5-6.1a.6.6 0 0 0 0-1.04L4.4 1.38a.6.6 0 0 0-.9.52z',
  plus: 'M7.25 1.5h1.5v5.75h5.75v1.5H8.75v5.75h-1.5V8.75H1.5v-1.5h5.75z',
  queue: 'M1 2.25h14v1.5H1zm0 4.5h8v1.5H1zm0 4.5h8v1.5H1zm11-3.5h1.5v2.5H16v1.5h-2.5v2.5H12v-2.5H9.5v-1.5H12z',
  artist: 'M8 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-4.5 3a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0zM1.5 15.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5H13c0-2.4-2.2-4-5-4s-5 1.6-5 4z',
  album: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4 8a4 4 0 1 1 8 0 4 4 0 0 1-8 0z',
  share: 'M8 .5l3.8 3.8-1.06 1.06-1.99-1.99V10.5h-1.5V3.37L5.26 5.36 4.2 4.3zM1.5 7H5v1.5H3v6h10v-6h-2V7h3.5v9h-13z',
  link: 'M9.6 2.3a3 3 0 0 1 4.24 4.24l-2.12 2.12-1.06-1.06 2.12-2.12a1.5 1.5 0 0 0-2.12-2.12L8.54 5.48 7.48 4.42zM5.36 9.58l4.22-4.22 1.06 1.06-4.22 4.22zm1.1 2.04-2.12 2.12A3 3 0 0 1 .1 9.5l2.12-2.12 1.06 1.06-2.12 2.12a1.5 1.5 0 0 0 2.12 2.12l2.12-2.12z',
  chevron: 'M5.47 2.47a.75.75 0 0 1 1.06 0L12.06 8l-5.53 5.53a.75.75 0 1 1-1.06-1.06L9.94 8 5.47 3.53a.75.75 0 0 1 0-1.06z',
  caretUp: 'M8 4.5 14 11H2z',
  caretDown: 'M8 11.5 2 5h12z',
  check: 'M15.53 2.47a.75.75 0 0 1 0 1.06L6 13.06.47 7.53a.75.75 0 0 1 1.06-1.06L6 10.94l8.47-8.47a.75.75 0 0 1 1.06 0z',
  close: 'M2.47 2.47a.75.75 0 0 1 1.06 0L8 6.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L9.06 8l4.47 4.47a.75.75 0 1 1-1.06 1.06L8 9.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L6.94 8 2.47 3.53a.75.75 0 0 1 0-1.06z',
  search: 'M6.75 1.5a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5zM0 6.75a6.75 6.75 0 1 1 12.02 4.21l3.76 3.76-1.06 1.06-3.76-3.76A6.75 6.75 0 0 1 0 6.75z',
} as const;
