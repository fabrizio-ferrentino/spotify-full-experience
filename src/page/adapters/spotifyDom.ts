// Every web player DOM detail the extension relies on. Observed live in Phase 0
// (docs/phase0-findings.md, web-player.c884aee7.js, 2026-10-09).

export const SELECTORS = {
  /** Page content root (generic HTML landmark). */
  main: 'main',
  /** Track list grid shared by album, artist "Popular", playlist pages. */
  trackList: '[data-testid="track-list"]',
  /** Row grid inside each `[role=row]`. */
  trackRow: '[data-testid="tracklist-row"]',
  /** Header row of the grid (album pages; absent on artist "Popular"). */
  headerRow: '[role="row"][aria-rowindex="1"]',
  trackLink: 'a[data-testid="internal-track-link"]',
} as const;

/** Inline custom properties set by the player on the track list element. */
export const CSS_VARS = {
  gridTemplateColumns: '--grid-template-columns',
  var1MinWidth: '--var1-min-width',
} as const;

/** The artist "Popular" list uses this column for play counts; album lists do not have it. */
const VAR1_COLUMN = '[var1] minmax(var(--var1-min-width), var(--var1-max-width, 2fr))';
/** Same minimum width the player uses for the play count column on artist pages. */
export const VAR1_MIN_WIDTH = '120px';
/**
 * Explicit placement for our cells: the classes we copy from the duration cell place it
 * with `grid-column: last`, which would stack our cell on top of the duration.
 */
export const VAR1_GRID_COLUMN = 'var1';

/**
 * Adds the `var1` column before `[last]` in the player's grid template.
 * Returns null when the template is not the one observed (feature must stay off).
 */
export function withVar1Column(template: string): string | null {
  if (!template.includes('[first]') || !template.includes('[last]') || template.includes('[var1]')) return null;
  return template.replace('[last]', `${VAR1_COLUMN} [last]`);
}

const TRACK_HREF = /\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/;

/** Track ID of a row, from its internal track link. Rows without one (e.g. disc headers) return null. */
export function trackIdOfRow(row: Element): string | null {
  const href = row.querySelector(SELECTORS.trackLink)?.getAttribute('href') ?? '';
  return TRACK_HREF.exec(href)?.[1] ?? null;
}

/** Direct child cells of a row grid with the given ARIA role. */
export function cellsOf(rowGrid: Element, role: 'gridcell' | 'columnheader'): HTMLElement[] {
  return [...rowGrid.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute('role') === role,
  );
}
