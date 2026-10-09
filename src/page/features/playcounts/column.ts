// Renders play counts like the desktop app: a left-aligned "| Plays |" column right after the
// title, drawn inside the title cell of each row and of the header, so the title cell reads
// [title] [| plays .......] and the player's own resize handle closes it on the right.
// The leading "|" is our own resize handle for the title width; the player's handle keeps
// resizing the whole cell, so the plays column grows or shrinks while the title stays put.
// The player's grid is left untouched on purpose: an extra grid track is measured by the
// player's column resizer and persisted in its saved column widths, which would outlive the
// extension. hide() removes every node we added.
import { SELECTORS, titleCellOf, titleHeaderOf, trackIdOfRow } from '../../adapters/spotifyDom';
import { setText } from '../../core/dom';

/** data-* marker on every node we add. */
const OWN = 'data-sfe-playcount';

/** Below this list width the column is hidden, as the player does with optional columns. */
export const MIN_LIST_WIDTH = 560;
/** Limits for the title width chosen by dragging our handle. */
export const MIN_TITLE_WIDTH = 120;
export const MIN_PLAYS_WIDTH = 120;

const DURATION_TEXT = /^\d+:\d{2}$/;
/** Default share of the title cell given to the play count column, until the user drags it. */
const PLAYS_SHARE = 60;
/** Width of the player's resize handle; our handle copies its look. */
const HANDLE_WIDTH = 8;
/** Space between the column edge and the numbers, matching the label after the handle. */
const INSET = 16;

/** Same left edge in every row: pushed to the right end of the flex title cell. */
const ROW_STYLE = [
  'margin-left: auto',
  'flex-grow: 0',
  'flex-shrink: 0',
  'box-sizing: border-box',
  `padding: 0 ${INSET}px`,
  // The duration class we copy is a flex box aligned to the end.
  'justify-content: flex-start',
  'text-align: left',
  'white-space: nowrap',
  'overflow: hidden',
].join('; ');
/** Takes the free space of the header cell (the player's resize handle also has margin-left: auto). */
const SPACER_STYLE = 'flex: 1 1 auto; min-width: 0';
const HEADER_BOX_STYLE = 'flex-grow: 0; flex-shrink: 0; display: flex; align-items: center; box-sizing: border-box; min-width: 0';
const HEADER_LABEL_STYLE = [
  'flex: 1 1 auto',
  'min-width: 0',
  'text-align: left',
  `padding: 0 ${HANDLE_WIDTH}px 0 ${INSET - HANDLE_WIDTH}px`,
  'white-space: nowrap',
  'overflow: hidden',
  'text-overflow: ellipsis',
].join('; ');
/** Attribute keeping the measured pixel offset of the header column. */
const OFFSET_ATTR = 'data-sfe-offset';

/** Width of the play count column in a cell: what the title leaves, or the default share. */
export function playsBasis(titleWidth: number | null): string {
  return titleWidth === null ? `${PLAYS_SHARE}%` : `calc(100% - ${titleWidth}px)`;
}

/** Keeps a chosen title width inside the cell, leaving the plays column its minimum width. */
export function clampTitleWidth(width: number, cellWidth: number): number {
  return Math.min(Math.max(MIN_TITLE_WIDTH, cellWidth - MIN_PLAYS_WIDTH), Math.max(MIN_TITLE_WIDTH, width));
}

/** The header column ends at the player's handle: same width minus the measured offset. */
function headerBasis(titleWidth: number | null, offset: number): string {
  return `calc(${playsBasis(titleWidth)} - ${offset}px)`;
}

export interface ColumnSource {
  lookup(trackId: string): number | undefined;
  label(): string;
  format(value: number): string;
  /** Title width chosen by the user, or null for the default layout. */
  titleWidth(): number | null;
  /** Called once a drag of our handle ends (null: reset by double click). */
  saveTitleWidth(width: number | null): void;
}

export class PlaycountColumn {
  private visible = false;
  /** Follows the title header width, which changes when the user drags a column edge. */
  private headerObserver: ResizeObserver | null = null;
  /** Width being dragged, applied live before it is saved. */
  private dragWidth: number | null = null;
  /** Title width the nodes currently use; undefined until the first render. */
  private applied: number | null | undefined;

  constructor(
    readonly list: HTMLElement,
    private readonly source: ColumnSource,
    private readonly measureWidth: () => number = () => list.clientWidth,
    private readonly onLayoutChange: () => void = () => {},
  ) {}

  get shown(): boolean {
    return this.visible;
  }

  /** Title width in use, clamped to the current cell (re-evaluated on every render and resize). */
  private currentTitleWidth(): number | null {
    const width = this.dragWidth ?? this.source.titleWidth();
    if (width === null) return null;
    const cellWidth = this.list.querySelector(`[${OWN}="row"]`)?.parentElement?.getBoundingClientRect().width ?? 0;
    return cellWidth > 0 ? clampTitleWidth(width, cellWidth) : width;
  }

  /** Shows, refreshes or hides the column for the current rows, data and width. Idempotent. */
  render(): void {
    const rows = [...this.list.querySelectorAll<HTMLElement>(SELECTORS.trackRow)];
    const hasData = rows.some((row) => {
      const id = trackIdOfRow(row);
      return id !== null && this.source.lookup(id) !== undefined;
    });
    if (!hasData || this.measureWidth() < MIN_LIST_WIDTH) {
      this.hide();
      return;
    }
    this.visible = true;

    let titleColindex: string | null = null;
    let firstNode: HTMLElement | null = null;
    for (const row of rows) {
      const cell = titleCellOf(row);
      if (!cell) continue;
      titleColindex ??= cell.getAttribute('aria-colindex');
      const id = trackIdOfRow(row);
      const count = id === null ? undefined : this.source.lookup(id);
      const node = this.ensureRowNode(cell, row);
      firstNode ??= node;
      setText(node, count === undefined ? '' : this.source.format(count));
    }

    const header = this.list.querySelector<HTMLElement>(SELECTORS.headerRow);
    const titleHeader = header && titleColindex !== null ? titleHeaderOf(header, titleColindex) : null;
    if (titleHeader) setText(this.ensureHeaderLabel(titleHeader), this.source.label());
    this.applyTitleWidth(this.currentTitleWidth());
    if (titleHeader) this.alignHeader(titleHeader, firstNode);
  }

  /** Removes every node we added; the player's markup is otherwise untouched. */
  hide(): void {
    this.headerObserver?.disconnect();
    this.headerObserver = null;
    for (const node of this.list.querySelectorAll(`[${OWN}]`)) node.remove();
    this.visible = false;
    this.applied = undefined;
  }

  /** Sizes every row node and the header column for the given title width. */
  private applyTitleWidth(width: number | null, force = false): void {
    if (!force && width === this.applied) return;
    this.applied = width;
    const basis = playsBasis(width);
    for (const node of this.list.querySelectorAll<HTMLElement>(`${SELECTORS.trackRow} [${OWN}="row"]`)) {
      node.style.flexBasis = basis;
    }
    const box = this.list.querySelector<HTMLElement>(`[${OWN}="header"]`);
    if (box) box.style.flexBasis = headerBasis(width, Number(box.getAttribute(OFFSET_ATTR) ?? HANDLE_WIDTH));
  }

  /**
   * Lines the header column up with the row column by measuring both: the header cell's own
   * flex layout (resize handle with an auto margin) makes a computed width unreliable.
   * Only the pixel offset is measured; every resize of the header re-checks it.
   */
  private alignHeader(titleHeader: HTMLElement, firstNode: HTMLElement | null): void {
    const box = titleHeader.querySelector<HTMLElement>(`:scope > [${OWN}="header"]`);
    if (!box || !firstNode) return;
    if (!this.headerObserver && typeof ResizeObserver !== 'undefined') {
      this.headerObserver = new ResizeObserver(() => this.onLayoutChange());
      this.headerObserver.observe(titleHeader);
    }
    const boxRect = box.getBoundingClientRect();
    const delta = Math.round(boxRect.left - firstNode.getBoundingClientRect().left);
    if (delta === 0 || boxRect.width === 0) return;
    const offset = Number(box.getAttribute(OFFSET_ATTR) ?? HANDLE_WIDTH) - delta;
    box.setAttribute(OFFSET_ATTR, String(offset));
    box.style.flexBasis = headerBasis(this.currentTitleWidth(), offset);
  }

  /** Our node is kept as the last child of the title cell, styled like the duration text. */
  private ensureRowNode(cell: HTMLElement, row: HTMLElement): HTMLElement {
    let node = cell.querySelector<HTMLElement>(`:scope > [${OWN}]`);
    if (!node) {
      node = document.createElement('div');
      node.setAttribute(OWN, 'row');
      const durationText = [...row.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && DURATION_TEXT.test(el.textContent?.trim() ?? ''),
      );
      if (durationText) node.className = durationText.className;
      else node.style.cssText = 'color: var(--text-subdued); font-variant-numeric: tabular-nums;';
      node.style.cssText += `; ${ROW_STYLE}`;
      node.style.flexBasis = playsBasis(this.currentTitleWidth());
    }
    if (cell.lastElementChild !== node) cell.append(node);
    return node;
  }

  /** Header layout: [player's label] [spacer] [| label] [player's resize handle]. */
  private ensureHeaderLabel(header: HTMLElement): HTMLElement {
    const handle = header.querySelector<HTMLElement>(`:scope > ${SELECTORS.resizeHandle}`);
    let spacer = header.querySelector<HTMLElement>(`:scope > [${OWN}="spacer"]`);
    let box = header.querySelector<HTMLElement>(`:scope > [${OWN}="header"]`);
    if (!spacer || !box) {
      spacer?.remove();
      box?.remove();
      spacer = document.createElement('div');
      spacer.setAttribute(OWN, 'spacer');
      spacer.style.cssText = SPACER_STYLE;
      box = this.createHeaderBox(header, handle);
    }
    const label = box.querySelector<HTMLElement>(`[${OWN}-label]`) ?? box;
    if (handle) {
      if (box.nextElementSibling !== handle) header.insertBefore(box, handle);
    } else if (header.lastElementChild !== box) {
      header.append(box);
    }
    if (box.previousElementSibling !== spacer) header.insertBefore(spacer, box);
    return label;
  }

  private createHeaderBox(header: HTMLElement, handle: HTMLElement | null): HTMLElement {
    const box = document.createElement('div');
    box.setAttribute(OWN, 'header');
    box.style.cssText = HEADER_BOX_STYLE;
    box.style.flexBasis = headerBasis(this.currentTitleWidth(), HANDLE_WIDTH);
    box.append(this.createTitleHandle(header, handle));
    const label = document.createElement('span');
    label.setAttribute(`${OWN}-label`, '');
    const titleLabel = [...header.querySelectorAll('span')].find(
      (el) => !el.closest(`[${OWN}]`) && el.children.length === 0 && el.textContent?.trim(),
    );
    if (titleLabel) label.className = titleLabel.className;
    label.style.cssText = HEADER_LABEL_STYLE;
    box.append(label);
    return box;
  }

  /**
   * Our resize handle for the title width. It looks like the player's handle (same class) but
   * has no role and no React handlers: events are handled here and never reach the player.
   */
  private createTitleHandle(header: HTMLElement, playerHandle: HTMLElement | null): HTMLElement {
    const handle = document.createElement('div');
    handle.setAttribute(`${OWN}-handle`, '');
    handle.setAttribute('aria-hidden', 'true');
    if (playerHandle) handle.className = playerHandle.className;
    // The player's handle gets its height from the header layout, not from its class: copy it.
    const height = playerHandle ? getComputedStyle(playerHandle).height : '';
    handle.style.cssText = `flex: 0 0 ${HANDLE_WIDTH}px; cursor: col-resize; touch-action: none; height: ${height || '18px'}`;

    const isolate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    handle.addEventListener('click', isolate);
    handle.addEventListener('dblclick', (event) => {
      isolate(event);
      this.dragWidth = null;
      this.source.saveTitleWidth(null);
      this.applyTitleWidth(null, true);
      this.onLayoutChange();
    });
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      isolate(event);
      const cell = header.getBoundingClientRect();
      // Keep the grab point under the pointer: the column edge is the left edge of our box.
      const edge = handle.parentElement?.getBoundingClientRect().left ?? event.clientX;
      const grab = event.clientX - edge;
      handle.setPointerCapture?.(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        isolate(moveEvent);
        this.dragWidth = clampTitleWidth(Math.round(moveEvent.clientX - grab - cell.left), cell.width);
        this.applyTitleWidth(this.dragWidth);
      };
      const end = (endEvent: PointerEvent) => {
        isolate(endEvent);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        handle.releasePointerCapture?.(endEvent.pointerId);
        const width = this.dragWidth;
        this.dragWidth = null;
        if (width !== null) this.source.saveTitleWidth(width);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    return handle;
  }
}
