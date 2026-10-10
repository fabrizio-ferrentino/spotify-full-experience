// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditablePlaylist } from '../../src/page/adapters/libraryShapes';
import { LikedSongsView, type RowActions } from '../../src/page/features/artist-liked-songs/view';
import type { LikedTrack } from '../../src/shared/likedIndex';

const typography = { heading: '', title: '', subdued: '' };
const track: LikedTrack = {
  t: 'A'.repeat(22),
  a: 'B'.repeat(22),
  d: Date.parse('2026-10-07T10:00:00Z'),
  n: 'The Wolfpack',
  ar: ['Angels & Airwaves'],
  ad: ['B'.repeat(22)],
  al: 'The Dream Walker',
  ai: 'L'.repeat(22),
  c: '',
  ms: 234000,
  e: false,
};
const playlists: EditablePlaylist[] = [
  { uri: 'spotify:collection:tracks', name: 'Liked Songs', imageUrl: null, curates: true, liked: true },
  { uri: `spotify:playlist:${'P'.repeat(22)}`, name: 'Road trip', imageUrl: null, curates: false, liked: false },
  { uri: `spotify:playlist:${'Q'.repeat(22)}`, name: 'Focus', imageUrl: null, curates: true, liked: false },
];

function openView(actions: Partial<RowActions>) {
  document.documentElement.lang = 'it';
  document.body.innerHTML = '<main></main>';
  const view = new LikedSongsView(document.querySelector('main')!, typography, () => {}, actions);
  view.open({ artistId: 'B'.repeat(22), artistName: 'Angels & Airwaves', imageUrl: null, tracks: [track], now: Date.parse('2026-10-10T10:00:00Z') });
  return { view, row: view.root.querySelector('li')! };
}

function actions(overrides: Partial<RowActions> = {}) {
  return {
    play: vi.fn(),
    queue: vi.fn(async () => true),
    playlists: vi.fn(async () => playlists),
    curate: vi.fn(async () => true),
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const menuButtons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-sfe-liked-menu] button')];
const byText = (text: string) => menuButtons().find((b) => b.textContent === text)!;
const toast = () => document.querySelector('[data-sfe-liked-toast]')?.textContent;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('liked songs rows, desktop-like actions', () => {
  it('plays from the ▶ in place of the number and from the big play button', () => {
    const a = actions();
    const { view, row } = openView(a);
    row.querySelector<HTMLButtonElement>('button[aria-label="Riproduci The Wolfpack"]')!.click();
    expect(a.play).toHaveBeenCalledWith(track);
    view.root.querySelector<HTMLButtonElement>('button[aria-label="Riproduci "]')!.click();
    expect(a.play).toHaveBeenCalledTimes(2);
    view.close();
  });

  it('offers the desktop menu entries in order', () => {
    const { view, row } = openView(actions());
    row.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    expect(menuButtons().map((b) => b.textContent)).toEqual([
      'Aggiungi alla playlist',
      'Rimuovi dai brani che ti piacciono',
      'Aggiungi in coda',
      "Vai all'artista",
      "Vai all'album",
      'Condividi',
    ]);
    view.close();
  });

  it('removes from the liked songs and adds to the queue, with a toast', async () => {
    const a = actions();
    const { view, row } = openView(a);
    row.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    byText('Rimuovi dai brani che ti piacciono').click();
    expect(a.curate).toHaveBeenCalledWith(track, [{ contextUri: 'spotify:collection:tracks', curationType: 'UNCURATE' }]);
    await flush();
    expect(toast()).toBe('Rimosso dai brani che ti piacciono');

    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    byText('Aggiungi in coda').click();
    expect(a.queue).toHaveBeenCalledWith(track);
    await flush();
    expect(toast()).toBe('Aggiunto in coda');
    view.close();
  });

  it('reports failures instead of success', async () => {
    const { view, row } = openView(actions({ queue: vi.fn(async () => false) }));
    row.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    byText('Aggiungi in coda').click();
    await flush();
    expect(toast()).toBe("Non è stato possibile completare l'operazione");
    view.close();
  });

  it('adds to a playlist from the submenu, which lists and filters editable playlists', async () => {
    const a = actions();
    const { view, row } = openView(a);
    row.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    byText('Aggiungi alla playlist').click();
    await flush();
    await flush();
    const names = () => menuButtons().map((b) => b.textContent);
    // The player's CSS hides `body > div` without id or class: panels set their display.
    for (const panel of document.querySelectorAll<HTMLElement>('body > [data-sfe-liked-menu]')) expect(panel.style.display).not.toBe('');
    expect(names()).toContain('Road trip');
    expect(names()).toContain('Focus');
    expect(names()).not.toContain('Liked Songs');
    const search = document.querySelector<HTMLInputElement>('[data-sfe-liked-menu] input')!;
    search.value = 'road';
    search.dispatchEvent(new Event('input'));
    expect(names()).not.toContain('Focus');
    byText('Road trip').click();
    expect(a.curate).toHaveBeenCalledWith(track, [{ contextUri: `spotify:playlist:${'P'.repeat(22)}`, curationType: 'CURATE' }]);
    expect(document.querySelector('[data-sfe-liked-menu]')).toBeNull();
    view.close();
  });

  it('"Save in" sends only what changed, after Done', async () => {
    const a = actions();
    const { view, row } = openView(a);
    row.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click();
    await flush();
    const dialog = document.querySelector('[data-sfe-liked-save]')!;
    const option = (name: string) => [...dialog.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')].find((b) => b.textContent === name)!;
    expect(option('Brani che ti piacciono').getAttribute('aria-checked')).toBe('true');
    expect(option('Road trip').getAttribute('aria-checked')).toBe('false');
    option('Brani che ti piacciono').click();
    option('Road trip').click();
    option('Focus').click();
    option('Focus').click();
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Fatto')!.click();
    expect(a.curate).toHaveBeenCalledWith(track, [
      { contextUri: 'spotify:collection:tracks', curationType: 'UNCURATE' },
      { contextUri: `spotify:playlist:${'P'.repeat(22)}`, curationType: 'CURATE' },
    ]);
    expect(document.querySelector('[data-sfe-liked-save]')).toBeNull();
    view.close();
  });

  it('"Save in" sends nothing on Cancel or Escape, and the view stays open', async () => {
    const a = actions();
    const { view, row } = openView(a);
    const tick = row.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    tick.click();
    await flush();
    [...document.querySelectorAll('[data-sfe-liked-save] button')].find((b) => b.textContent === 'Annulla')!.dispatchEvent(new MouseEvent('click'));
    expect(document.querySelector('[data-sfe-liked-save]')).toBeNull();
    tick.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[data-sfe-liked-save]')).toBeNull();
    expect(view.isOpen).toBe(true);
    expect(a.curate).not.toHaveBeenCalled();
    view.close();
  });

  it('offers only navigation without library and player actions', () => {
    const { view, row } = openView({});
    expect(row.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
    row.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    expect(menuButtons().map((b) => b.textContent)).toEqual(["Vai all'artista", "Vai all'album", 'Condividi']);
    view.close();
  });
});
