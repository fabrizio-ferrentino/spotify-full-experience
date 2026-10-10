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
  /** Artist and album page header. */
  entityHeader: '[data-testid="entity-header"]',
  /** Playlist and Liked Songs page (checked live on 2026-10-10). */
  playlistPage: 'section[data-testid="playlist-page"]',
  /** Main track list of a playlist page (Liked Songs uses `track-list`). */
  playlistTrackList: '[data-testid="playlist-tracklist"]',
  /** Right side of the action bar, holding the "Elenco" (view as) button. */
  actionBarTrailing: '[data-testid="action-bar-row-trailing"]',
} as const;

/** The player's "view as" button (compact / list) in the action bar. */
export function nativeViewButtonOf(trailing: ParentNode): HTMLButtonElement | null {
  return trailing.querySelector<HTMLButtonElement>('button[role="combobox"][aria-haspopup="true"]');
}

/**
 * Chooses a "view as" mode through the player's own menu: opens it (hidden from sight), clicks
 * the radio item with that label (or at that position), and lets the player close it. The menu
 * is `ul[role=menu]#<aria-controls>` of `menuitemradio` items (Compatta, Elenco), rendered by
 * tippy in `[data-tippy-root]` (checked live on 2026-10-10).
 */
export async function chooseNativeView(button: HTMLButtonElement, label: string, position: number): Promise<boolean> {
  const veil = document.createElement('style');
  veil.textContent = '[data-tippy-root] { opacity: 0 !important; }';
  document.head.append(veil);
  try {
    button.click();
    for (let waited = 0; waited < 600; waited += 50) {
      const menu = document.getElementById(button.getAttribute('aria-controls') ?? '');
      const items = menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')] : [];
      if (items.length) {
        const wanted = label.trim().toLocaleLowerCase();
        const item = items.find((candidate) => candidate.textContent?.trim().toLocaleLowerCase() === wanted) ?? items[position];
        item?.click();
        return !!item;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  } finally {
    // Leave the menu closed whatever happened, then show tippy menus again.
    if (button.getAttribute('aria-expanded') === 'true') button.click();
    setTimeout(() => veil.remove(), 100);
  }
}

/**
 * The page's own track list on playlist pages (`playlist-tracklist`) or Liked Songs
 * (`track-list`); never the "recommended" list below a playlist, also a `track-list`.
 */
export function pageTrackListOf(page: ParentNode, likedSongs: boolean): HTMLElement | null {
  return page.querySelector<HTMLElement>(SELECTORS.playlistTrackList) ?? (likedSongs ? page.querySelector<HTMLElement>(SELECTORS.trackList) : null);
}

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

/**
 * The visible box of the main view: the first ancestor of <main> that scrolls (the player
 * scrolls a wrapper, so <main> itself moves above the viewport when the page is scrolled).
 */
export function mainViewportOf(main: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = main; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
  }
  return main;
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
