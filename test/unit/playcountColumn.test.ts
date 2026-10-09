// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { titleCellOf, trackIdOfRow } from '../../src/page/adapters/spotifyDom';
import { MIN_LIST_WIDTH, PlaycountColumn } from '../../src/page/features/playcounts/column';
import { PlaycountStore } from '../../src/page/features/playcounts/store';

// Synthetic markup reproducing the album track list structure observed in Phase 0.
const ALBUM_TEMPLATE =
  '[index] var(--index-column-width, 16px) [first] minmax(var(--first-min-width), var(--first-max-width, 4fr)) [last] minmax(var(--last-min-width), var(--last-max-width, 1fr))';
const IDS = ['0yGrVvkJl1lMo4CcQShHd7', '3lGUSc1x03KLsxKuyIEYf1', '13GGf9FYOVVmKuudG0Kqhy'];

function row(index: number, id: string | null): string {
  const link = id ? `<a data-testid="internal-track-link" href="/intl-it/track/${id}">t</a>` : '';
  return `
    <div role="row" aria-rowindex="${index + 2}">
      <div role="presentation" data-testid="tracklist-row">
        <div role="gridcell" aria-colindex="1">${index + 1}</div>
        <div role="gridcell" aria-colindex="2"><div class="title-block">${link}<span>artist</span></div></div>
        <div role="gridcell" aria-colindex="3" class="duration-cell"><button>+</button><div class="duration-text">3:53</div></div>
      </div>
    </div>`;
}

function buildList(ids: (string | null)[] = IDS): HTMLElement {
  document.body.innerHTML = `
    <main>
      <div role="grid" data-testid="track-list" aria-colcount="3" aria-rowcount="${ids.length + 1}">
        <div role="presentation">
          <div role="row" aria-rowindex="1">
            <div role="columnheader" aria-colindex="1">#</div>
            <div role="columnheader" aria-colindex="2">
              <div data-testid="column-header-context-menu"><div class="hdr"><span class="hdr-text">Titolo</span></div></div>
              <div role="separator" class="handle" tabindex="0"></div>
            </div>
            <div role="columnheader" aria-colindex="3"><svg></svg></div>
          </div>
          ${ids.map((id, i) => row(i, id)).join('')}
        </div>
      </div>
    </main>`;
  const list = document.querySelector<HTMLElement>('[data-testid="track-list"]')!;
  list.style.setProperty('--grid-template-columns', ALBUM_TEMPLATE);
  return list;
}

const fmt = (value: number) => value.toLocaleString('it');

function columnFor(list: HTMLElement, store: PlaycountStore, width = 800) {
  return new PlaycountColumn(list, { lookup: (id) => store.get(id), label: () => 'Riproduzioni', format: fmt }, () => width);
}

const rowsOf = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('[data-testid="tracklist-row"]')];
const countText = (row: HTMLElement) => titleCellOf(row)?.querySelector(':scope > [data-sfe-playcount]')?.textContent;

describe('spotifyDom helpers', () => {
  it('reads the track id and title cell of a row', () => {
    buildList();
    const first = rowsOf(document.querySelector('[data-testid="track-list"]')!)[0]!;
    expect(trackIdOfRow(first)).toBe(IDS[0]);
    expect(titleCellOf(first)?.getAttribute('aria-colindex')).toBe('2');
  });
});

describe('PlaycountColumn', () => {
  let store: PlaycountStore;
  beforeEach(() => {
    store = new PlaycountStore();
    store.ingest(new Map([[IDS[0]!, 2441116], [IDS[1]!, 1000]]));
  });

  it('adds a right-aligned count to every title cell and a label to the title header', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    expect(column.shown).toBe(true);

    expect(rowsOf(list).map(countText)).toEqual([fmt(2441116), fmt(1000), '']);
    const node = titleCellOf(rowsOf(list)[0]!)!.lastElementChild as HTMLElement;
    expect(node.className).toBe('duration-text');
    expect(node.style.marginLeft).toBe('auto');

    const titleHeader = list.querySelector('[role="columnheader"][aria-colindex="2"]')!;
    const ours = [...titleHeader.children].map((el) => el.getAttribute('data-sfe-playcount') ?? el.getAttribute('role') ?? 'player');
    expect(ours).toEqual(['player', 'spacer', 'header', 'separator']);
    const box = titleHeader.querySelector('[data-sfe-playcount="header"]')!;
    const label = box.querySelector('[data-sfe-playcount-label]')!;
    expect(label.textContent).toBe('Riproduzioni');
    expect(label.className).toBe('hdr-text');
    // The leading divider only copies the handle's look: never a second resize handle.
    const divider = box.firstElementChild!;
    expect(divider.getAttribute('aria-hidden')).toBe('true');
    expect(divider.hasAttribute('role')).toBe(false);
    expect(titleHeader.querySelectorAll('[role="separator"]').length).toBe(1);
  });

  it('never touches the grid: template, column count and column indexes stay the same', () => {
    const list = buildList();
    const style = list.getAttribute('style');
    columnFor(list, store).render();
    expect(list.getAttribute('style')).toBe(style);
    expect(list.getAttribute('aria-colcount')).toBe('3');
    const indexes = [...list.querySelectorAll('[aria-colindex]')].map((el) => el.getAttribute('aria-colindex'));
    expect(indexes.filter((i) => i === '4')).toEqual([]);
  });

  it('is idempotent', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    const html = list.outerHTML;
    column.render();
    column.render();
    expect(list.outerHTML).toBe(html);
    expect(list.querySelectorAll('[data-sfe-playcount]').length).toBe(IDS.length + 2);
  });

  it('restores the original markup exactly when hidden', () => {
    const list = buildList();
    const original = list.outerHTML;
    const column = columnFor(list, store);
    column.render();
    column.hide();
    expect(list.outerHTML).toBe(original);
    expect(column.shown).toBe(false);
  });

  it('stays hidden without data or on narrow lists', () => {
    const list = buildList();
    const original = list.outerHTML;
    columnFor(list, new PlaycountStore()).render();
    expect(list.outerHTML).toBe(original);
    columnFor(list, store, MIN_LIST_WIDTH - 1).render();
    expect(list.outerHTML).toBe(original);
  });

  it('follows data that arrives later and rows added by the player', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    store.ingest(new Map([[IDS[2]!, 7]]));
    list.querySelector('[role="presentation"]')!.insertAdjacentHTML('beforeend', row(3, IDS[0]!));
    column.render();
    expect(rowsOf(list).map(countText)).toEqual([fmt(2441116), fmt(1000), '7', fmt(2441116)]);
  });

  it('stays the last child when the player appends to the title cell', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    const cell = titleCellOf(rowsOf(list)[0]!)!;
    cell.append(document.createElement('i'));
    column.render();
    expect(cell.lastElementChild?.hasAttribute('data-sfe-playcount')).toBe(true);
    expect(cell.querySelectorAll('[data-sfe-playcount]').length).toBe(1);
  });
});

describe('PlaycountStore', () => {
  it('reports changes and caps its size', () => {
    const store = new PlaycountStore();
    expect(store.ingest(new Map([['a', 1]]))).toBe(true);
    expect(store.ingest(new Map([['a', 1]]))).toBe(false);
    expect(store.ingest(new Map([['a', 2]]))).toBe(true);
    store.ingest(new Map(Array.from({ length: 6000 }, (_, i) => [`k${i}`, i] as [string, number])));
    expect(store.size).toBe(5000);
    expect(store.get('k5999')).toBe(5999);
    expect(store.get('a')).toBeUndefined();
  });
});
