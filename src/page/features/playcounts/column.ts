// Renders play counts as a fixed-width, right-aligned column at the end of the title cell of
// each row, with "| label |" at the end of the title header, like the desktop app. The player's grid is left untouched on purpose: an extra grid
// track is measured by the player's column resizer and persisted in its saved column widths,
// which would outlive the extension. hide() removes every node we added.
import { SELECTORS, titleCellOf, titleHeaderOf, trackIdOfRow } from '../../adapters/spotifyDom';
import { setText } from '../../core/dom';

/** data-* marker on every node we add. */
const OWN = 'data-sfe-playcount';

/** Below this list width the column is hidden, as the player does with optional columns. */
export const MIN_LIST_WIDTH = 560;

const DURATION_TEXT = /^\d+:\d{2}$/;
/** Width of the play count column, in rows and header alike. */
const COLUMN_WIDTH = 140;
/** Gap between the numbers and the next column; the header label stops before the resize handle. */
const ROW_PADDING_RIGHT = 16;
const HANDLE_WIDTH = 8;

/** Pushed to the right edge of the flex title cell; the title text keeps its own ellipsis. */
const ROW_STYLE = [
  'margin-left: auto',
  `flex: 0 0 ${COLUMN_WIDTH}px`,
  'box-sizing: border-box',
  `padding-right: ${ROW_PADDING_RIGHT}px`,
  'text-align: right',
  'white-space: nowrap',
  'overflow: hidden',
].join('; ');
/** Takes the free space of the header cell (the player's resize handle also has margin-left: auto). */
const SPACER_STYLE = 'flex: 1 1 auto; min-width: 0';
/** Ends where the resize handle starts, so its left edge lines up with the row column. */
const HEADER_BOX_STYLE = `flex: 0 0 ${COLUMN_WIDTH - HANDLE_WIDTH}px; display: flex; align-items: center; box-sizing: border-box; min-width: 0`;
const HEADER_LABEL_STYLE = [
  'flex: 1 1 auto',
  'min-width: 0',
  'text-align: right',
  `padding-right: ${ROW_PADDING_RIGHT - HANDLE_WIDTH}px`,
  'white-space: nowrap',
  'overflow: hidden',
  'text-overflow: ellipsis',
].join('; ');

export interface ColumnSource {
  lookup(trackId: string): number | undefined;
  label(): string;
  format(value: number): string;
}

export class PlaycountColumn {
  private visible = false;

  constructor(
    readonly list: HTMLElement,
    private readonly source: ColumnSource,
    private readonly measureWidth: () => number = () => list.clientWidth,
  ) {}

  get shown(): boolean {
    return this.visible;
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
    for (const row of rows) {
      const cell = titleCellOf(row);
      if (!cell) continue;
      titleColindex ??= cell.getAttribute('aria-colindex');
      const id = trackIdOfRow(row);
      const count = id === null ? undefined : this.source.lookup(id);
      setText(this.ensureRowNode(cell, row), count === undefined ? '' : this.source.format(count));
    }

    const header = this.list.querySelector<HTMLElement>(SELECTORS.headerRow);
    const titleHeader = header && titleColindex !== null ? titleHeaderOf(header, titleColindex) : null;
    if (titleHeader) setText(this.ensureHeaderLabel(titleHeader), this.source.label());
  }

  /** Removes every node we added; the player's markup is otherwise untouched. */
  hide(): void {
    for (const node of this.list.querySelectorAll(`[${OWN}]`)) node.remove();
    this.visible = false;
  }

  /** Our node is kept as the last child of the title cell, styled like the duration text. */
  private ensureRowNode(cell: HTMLElement, row: HTMLElement): HTMLElement {
    let node = cell.querySelector<HTMLElement>(`:scope > [${OWN}]`);
    if (!node) {
      node = document.createElement('div');
      node.setAttribute(OWN, '');
      const durationText = [...row.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && DURATION_TEXT.test(el.textContent?.trim() ?? ''),
      );
      if (durationText) node.className = durationText.className;
      else node.style.cssText = 'color: var(--text-subdued); font-variant-numeric: tabular-nums;';
      node.style.cssText += `; ${ROW_STYLE}`;
    }
    if (cell.lastElementChild !== node) cell.append(node);
    return node;
  }

  /**
   * Header layout: [player's label] [spacer] [ | label ] [player's resize handle].
   * The leading "|" is a copy of the resize handle's look only: no role, no events.
   */
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
    if (handle) {
      const divider = document.createElement('div');
      divider.className = handle.className;
      divider.setAttribute('aria-hidden', 'true');
      divider.style.cssText = 'pointer-events: none; cursor: default; flex: 0 0 auto';
      box.append(divider);
    }
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
}
