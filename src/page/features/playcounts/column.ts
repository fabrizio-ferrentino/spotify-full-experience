// Renders a real grid column in a track list ("strategy A"): the same var1 column the player
// uses for play counts on artist pages. Every change is reversible by hide().
import {
  CSS_VARS,
  SELECTORS,
  VAR1_GRID_COLUMN,
  VAR1_MIN_WIDTH,
  cellsOf,
  trackIdOfRow,
  withVar1Column,
} from '../../adapters/spotifyDom';
import { setAttr, setText } from '../../core/dom';

/** data-* markers: our cells, and cells whose aria-colindex we shifted (original value kept). */
const OWN_CELL = 'data-sfe-playcount';
const SHIFTED = 'data-sfe-orig-colindex';

/** Below this list width the column is hidden, as the player does with optional columns. */
export const MIN_LIST_WIDTH = 560;

const DURATION_TEXT = /^\d+:\d{2}$/;

export interface ColumnSource {
  lookup(trackId: string): number | undefined;
  label(): string;
  format(value: number): string;
}

interface SavedList {
  columns: string;
  var1MinWidth: string;
  colcount: string | null;
}

export class PlaycountColumn {
  private saved: SavedList | null = null;

  constructor(
    readonly list: HTMLElement,
    private readonly source: ColumnSource,
    private readonly measureWidth: () => number = () => list.clientWidth,
  ) {}

  get shown(): boolean {
    return this.saved !== null;
  }

  /** Shows, refreshes or hides the column for the current rows, data and width. Idempotent. */
  render(): void {
    const rows = [...this.list.querySelectorAll<HTMLElement>(SELECTORS.trackRow)];
    const hasData = rows.some((row) => {
      const id = trackIdOfRow(row);
      return id !== null && this.source.lookup(id) !== undefined;
    });
    if (!hasData || this.measureWidth() < MIN_LIST_WIDTH || !this.applyLayout()) {
      this.hide();
      return;
    }
    const header = this.list.querySelector<HTMLElement>(SELECTORS.headerRow);
    if (header) this.patchRow(header, 'columnheader');
    for (const row of rows) this.patchRow(row, 'gridcell');
  }

  /** Removes every trace of the column and restores the player's values. */
  hide(): void {
    for (const cell of this.list.querySelectorAll(`[${OWN_CELL}]`)) cell.remove();
    for (const cell of this.list.querySelectorAll(`[${SHIFTED}]`)) {
      cell.setAttribute('aria-colindex', cell.getAttribute(SHIFTED) ?? '');
      cell.removeAttribute(SHIFTED);
    }
    if (!this.saved) return;
    const style = this.list.style;
    // Restore only what is still ours: the player may have re-rendered in the meantime.
    if (style.getPropertyValue(CSS_VARS.gridTemplateColumns).includes('[var1]')) {
      style.setProperty(CSS_VARS.gridTemplateColumns, this.saved.columns);
    }
    if (this.saved.var1MinWidth) style.setProperty(CSS_VARS.var1MinWidth, this.saved.var1MinWidth);
    else style.removeProperty(CSS_VARS.var1MinWidth);
    if (this.saved.colcount === null) this.list.removeAttribute('aria-colcount');
    else this.list.setAttribute('aria-colcount', this.saved.colcount);
    this.saved = null;
  }

  /** Adds the var1 column to the list grid. Returns false if the layout is not recognised. */
  private applyLayout(): boolean {
    const style = this.list.style;
    const current = style.getPropertyValue(CSS_VARS.gridTemplateColumns);
    if (this.saved && current.includes('[var1]')) return true;
    const next = withVar1Column(current);
    if (!next) return false;
    const colcount = this.saved?.colcount ?? this.list.getAttribute('aria-colcount');
    this.saved = {
      columns: current,
      var1MinWidth: this.saved?.var1MinWidth ?? style.getPropertyValue(CSS_VARS.var1MinWidth),
      colcount,
    };
    style.setProperty(CSS_VARS.gridTemplateColumns, next);
    style.setProperty(CSS_VARS.var1MinWidth, VAR1_MIN_WIDTH);
    const count = Number(colcount);
    if (colcount !== null && Number.isInteger(count)) setAttr(this.list, 'aria-colcount', String(count + 1));
    return true;
  }

  /** Ensures our cell sits right before the last cell, with consistent aria-colindex values. */
  private patchRow(rowGrid: HTMLElement, role: 'gridcell' | 'columnheader'): void {
    const existing = rowGrid.querySelector<HTMLElement>(`:scope > [${OWN_CELL}]`);
    const cells = cellsOf(rowGrid, role).filter((cell) => cell !== existing);
    const last = cells.at(-1);
    const previous = cells.at(-2);
    if (!last) return;
    const lastIndex = Number(last.getAttribute(SHIFTED) ?? last.getAttribute('aria-colindex'));
    if (!Number.isInteger(lastIndex)) return;

    const cell = existing ?? (role === 'columnheader' ? this.createHeaderCell(previous) : this.createDataCell(last));
    if (cell.nextElementSibling !== last) rowGrid.insertBefore(cell, last);
    setAttr(cell, 'aria-colindex', String(lastIndex));
    setAttr(last, SHIFTED, last.getAttribute(SHIFTED) ?? String(lastIndex));
    setAttr(last, 'aria-colindex', String(lastIndex + 1));

    const text = cell.querySelector(`[${OWN_CELL}-text]`) ?? cell;
    if (role === 'columnheader') {
      setText(text, this.source.label());
    } else {
      const id = trackIdOfRow(rowGrid);
      const count = id === null ? undefined : this.source.lookup(id);
      setText(text, count === undefined ? '' : this.source.format(count));
    }
  }

  /** Data cell styled like the duration cell next to it (classes copied from the live DOM). */
  private createDataCell(durationCell: HTMLElement): HTMLElement {
    const cell = document.createElement('div');
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute(OWN_CELL, '');
    cell.className = durationCell.className;
    cell.style.gridColumn = VAR1_GRID_COLUMN;
    const text = document.createElement('div');
    text.setAttribute(`${OWN_CELL}-text`, '');
    const durationText = [...durationCell.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && DURATION_TEXT.test(el.textContent?.trim() ?? ''),
    );
    if (durationText) text.className = durationText.className;
    else text.style.cssText = 'color: var(--text-subdued); font-variant-numeric: tabular-nums;';
    cell.append(text);
    return cell;
  }

  /** Header cell cloned from the title header, without the player's ids, handlers or resize handle. */
  private createHeaderCell(titleHeader: HTMLElement | undefined): HTMLElement {
    const cell = titleHeader ? (titleHeader.cloneNode(true) as HTMLElement) : document.createElement('div');
    cell.setAttribute('role', 'columnheader');
    cell.setAttribute(OWN_CELL, '');
    for (const el of [cell, ...cell.querySelectorAll('*')]) {
      el.removeAttribute('data-testid');
      el.removeAttribute('aria-sort');
      el.removeAttribute('tabindex');
      el.removeAttribute('id');
    }
    for (const separator of cell.querySelectorAll('[role="separator"]')) separator.remove();
    const leaves = [...cell.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.trim());
    const text = leaves.at(-1) ?? cell;
    text.setAttribute(`${OWN_CELL}-text`, '');
    cell.style.gridColumn = VAR1_GRID_COLUMN;
    cell.style.justifyContent = 'flex-end';
    for (const el of cell.querySelectorAll<HTMLElement>('div')) el.style.justifyContent = 'flex-end';
    return cell;
  }
}
