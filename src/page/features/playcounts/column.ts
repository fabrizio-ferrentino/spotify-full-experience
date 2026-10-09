// Renders play counts as a right-aligned column inside the title cell of each row, with the
// label inside the title header. The player's grid is left untouched on purpose: an extra grid
// track is measured by the player's column resizer and persisted in its saved column widths,
// which would outlive the extension. hide() removes every node we added.
import { SELECTORS, titleCellOf, titleHeaderOf, trackIdOfRow } from '../../adapters/spotifyDom';
import { setText } from '../../core/dom';

/** data-* marker on every node we add. */
const OWN = 'data-sfe-playcount';

/** Below this list width the column is hidden, as the player does with optional columns. */
export const MIN_LIST_WIDTH = 560;

const DURATION_TEXT = /^\d+:\d{2}$/;
/** Pushed to the right edge of the flex title cell; the title text keeps its own ellipsis. */
const OWN_STYLE = 'margin-left: auto; flex: 0 0 auto; padding: 0 16px; white-space: nowrap; text-align: right;';

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
    if (titleHeader) setText(this.ensureHeaderNode(titleHeader), this.source.label());
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
      node.style.cssText += OWN_STYLE;
    }
    if (cell.lastElementChild !== node) cell.append(node);
    return node;
  }

  /** Label right before the resize handle of the title header, styled like the "Title" label. */
  private ensureHeaderNode(header: HTMLElement): HTMLElement {
    let node = header.querySelector<HTMLElement>(`:scope > [${OWN}]`);
    if (!node) {
      node = document.createElement('span');
      node.setAttribute(OWN, '');
      const titleLabel = [...header.querySelectorAll('span')].find((el) => el.children.length === 0 && el.textContent?.trim());
      if (titleLabel) node.className = titleLabel.className;
      node.style.cssText = OWN_STYLE;
    }
    const handle = header.querySelector(`:scope > ${SELECTORS.resizeHandle}`);
    if (handle) {
      if (node.nextElementSibling !== handle) header.insertBefore(node, handle);
    } else if (header.lastElementChild !== node) {
      header.append(node);
    }
    return node;
  }
}
