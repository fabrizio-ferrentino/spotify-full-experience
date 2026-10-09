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
  /** Column resize handle, a direct child of the resizable header cell. */
  resizeHandle: '[role="separator"]',
  /** Root of the artist page content (hidden while our liked songs view is open). */
  artistPage: '[data-testid="artist-page"]',
  /** Artist and album page header. */
  entityHeader: '[data-testid="entity-header"]',
} as const;

/**
 * The artist "Popular" block: `div > [h2, div > track-list, button]` (docs/phase2-findings.md).
 * Returns null when the structure is not the one observed.
 */
export function popularBlockOf(root: ParentNode): HTMLElement | null {
  const list = root.querySelector(SELECTORS.trackList);
  const block = list?.parentElement?.parentElement ?? null;
  if (!block || ![...block.children].some((child) => child.tagName === 'H2')) return null;
  return block;
}

/** Artist name shown in the page header (fallback when the response was not captured). */
export function headerTitleOf(root: ParentNode): string | null {
  return root.querySelector(`${SELECTORS.entityHeader} h1`)?.textContent?.trim() || null;
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

/** The title cell of a track row: the grid cell holding the track link (a flex row). */
export function titleCellOf(rowGrid: Element): HTMLElement | null {
  return cellsOf(rowGrid, 'gridcell').find((cell) => cell.querySelector(SELECTORS.trackLink)) ?? null;
}

/** The header cell above the title cells, matched by aria-colindex. */
export function titleHeaderOf(headerRow: Element, titleColindex: string): HTMLElement | null {
  return cellsOf(headerRow, 'columnheader').find((cell) => cell.getAttribute('aria-colindex') === titleColindex) ?? null;
}
