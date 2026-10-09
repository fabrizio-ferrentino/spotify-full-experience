// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { trackIdOfRow, withVar1Column } from '../../src/page/adapters/spotifyDom';
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
        <div role="gridcell" aria-colindex="2">${link}</div>
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
            <div role="columnheader" aria-colindex="2" aria-sort="none" tabindex="-1">
              <div data-testid="column-header-context-menu"><div class="hdr"><span class="hdr-text">Titolo</span></div></div>
              <div role="separator"></div>
            </div>
            <div role="columnheader" aria-colindex="3"><svg></svg></div>
          </div>
          ${ids.map((id, i) => row(i, id)).join('')}
        </div>
      </div>
    </main>`;
  const list = document.querySelector<HTMLElement>('[data-testid="track-list"]')!;
  list.style.setProperty('--grid-template-columns', ALBUM_TEMPLATE);
  list.style.setProperty('--first-min-width', '180px');
  return list;
}

const fmt = (value: number) => value.toLocaleString('it');

function columnFor(list: HTMLElement, store: PlaycountStore, width = 800) {
  return new PlaycountColumn(
    list,
    { lookup: (id) => store.get(id), label: () => 'Riproduzioni', format: fmt },
    () => width,
  );
}

describe('spotifyDom helpers', () => {
  it('adds the var1 column before [last] once', () => {
    const next = withVar1Column(ALBUM_TEMPLATE);
    expect(next).toContain('[var1] minmax(var(--var1-min-width), var(--var1-max-width, 2fr)) [last]');
    expect(withVar1Column(next!)).toBeNull();
    expect(withVar1Column('1fr 1fr')).toBeNull();
  });

  it('reads the track id of a row', () => {
    buildList();
    expect(trackIdOfRow(document.querySelector('[data-testid="tracklist-row"]')!)).toBe(IDS[0]);
  });
});

describe('PlaycountColumn', () => {
  let store: PlaycountStore;
  beforeEach(() => {
    store = new PlaycountStore();
    store.ingest(new Map([[IDS[0]!, 2441116], [IDS[1]!, 1000]]));
  });

  it('adds header and cells as a real grid column', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();

    expect(column.shown).toBe(true);
    expect(list.getAttribute('aria-colcount')).toBe('4');
    expect(list.style.getPropertyValue('--grid-template-columns')).toContain('[var1]');
    expect(list.style.getPropertyValue('--var1-min-width')).toBe('120px');

    const header = list.querySelector('[role="row"][aria-rowindex="1"]')!;
    const headers = [...header.querySelectorAll(':scope > [role="columnheader"]')];
    expect(headers.map((h) => h.getAttribute('aria-colindex'))).toEqual(['1', '2', '3', '4']);
    expect(headers[2]!.textContent!.trim()).toBe('Riproduzioni');
    expect(headers[2]!.querySelector('[data-testid], [role="separator"]')).toBeNull();
    expect(headers[2]!.hasAttribute('aria-sort')).toBe(false);

    const rows = [...list.querySelectorAll('[data-testid="tracklist-row"]')];
    const texts = rows.map((r) => r.querySelector('[data-sfe-playcount]')!.textContent);
    expect(texts).toEqual([fmt(2441116), fmt(1000), '']);
    const cells = [...rows[0]!.querySelectorAll(':scope > [role="gridcell"]')];
    expect(cells.map((c) => c.getAttribute('aria-colindex'))).toEqual(['1', '2', '3', '4']);
    expect(cells[2]!.className).toBe('duration-cell');
    expect(cells[2]!.firstElementChild!.className).toBe('duration-text');
  });

  it('is idempotent', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    const html = list.outerHTML;
    column.render();
    column.render();
    expect(list.outerHTML).toBe(html);
    expect(list.querySelectorAll('[data-sfe-playcount]').length).toBe(IDS.length + 1);
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

  it('stays hidden without data, on narrow lists, or with an unknown layout', () => {
    const empty = new PlaycountStore();
    const list = buildList();
    const original = list.outerHTML;

    columnFor(list, empty).render();
    expect(list.outerHTML).toBe(original);

    columnFor(list, store, MIN_LIST_WIDTH - 1).render();
    expect(list.outerHTML).toBe(original);

    list.style.setProperty('--grid-template-columns', '1fr 2fr');
    const unknown = list.outerHTML;
    columnFor(list, store).render();
    expect(list.outerHTML).toBe(unknown);
  });

  it('follows data that arrives later and rows added by the player', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    store.ingest(new Map([[IDS[2]!, 7]]));
    const container = list.querySelector('[role="presentation"]')!;
    container.insertAdjacentHTML('beforeend', row(3, IDS[0]!));
    column.render();
    const texts = [...list.querySelectorAll('[data-sfe-playcount-text], [data-sfe-playcount]:not([role="columnheader"])')]
      .filter((el) => el.hasAttribute('data-sfe-playcount-text'))
      .map((el) => el.textContent);
    expect(texts.slice(1)).toEqual([fmt(2441116), fmt(1000), '7', fmt(2441116)]);
  });

  it('re-applies the layout if the player rewrites the template', () => {
    const list = buildList();
    const column = columnFor(list, store);
    column.render();
    list.style.setProperty('--grid-template-columns', ALBUM_TEMPLATE);
    column.render();
    expect(list.style.getPropertyValue('--grid-template-columns')).toContain('[var1]');
    column.hide();
    expect(list.style.getPropertyValue('--grid-template-columns')).toBe(ALBUM_TEMPLATE);
    expect(list.getAttribute('aria-colcount')).toBe('3');
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
