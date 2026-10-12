// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePlaylistPage, type PlaylistTrack } from '../../src/page/adapters/libraryShapes';
import type { PathfinderClient } from '../../src/page/core/pathfinderClient';
import { PlaylistToolsFeature } from '../../src/page/features/playlist-tools';
import type { AlbumStore } from '../../src/page/features/playlist-tools/albumStore';
import { matches, nextSort, normalize, queryTracks } from '../../src/page/features/playlist-tools/listQuery';
import { MAX_ITEMS, PlaylistStore } from '../../src/page/features/playlist-tools/playlistStore';
import type { LikedLibrary } from '../../src/page/library/likedLibrary';
import type { Playback } from '../../src/page/library/playback';
import { highlighted, type ListTrack } from '../../src/page/ui/trackList';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pathfinder');
const fixture = (name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as { request: { variables: unknown }; response: { json: { data: unknown } } };

const PLAYLIST = `spotify:playlist:${'P'.repeat(22)}`;
const id = (n: number) => `T${String(n).padStart(21, '0')}`;

function track(n: number, name: string, artist: string, album: string, d: number, ms: number): ListTrack {
  return { t: id(n), a: null, d, n: name, ar: [artist], ad: [null], al: album, ai: null, c: '', ms, e: false, u: `uid${n}` };
}

const list = [
  track(1, 'Ça plane pour moi', 'Plastic Bertrand', 'An 1', 300, 180_000),
  track(2, 'Anthem', 'Zebra', 'Bravo', 100, 240_000),
  track(3, 'blue', 'Angels', 'Love', 200, 200_000),
];

describe('search and sort', () => {
  it('matches every word in title, artists or album, ignoring case and accents', () => {
    expect(normalize('  Ça   PLANE ')).toBe('ca plane');
    expect(matches(list[0]!, 'ca bertrand')).toBe(true);
    expect(matches(list[0]!, 'plane zebra')).toBe(false);
    expect(matches(list[2]!, 'LOVE')).toBe(true);
    expect(matches(list[2]!, '')).toBe(true);
  });

  it('sorts by each key, keeps the playlist order for ties and never mutates the input', () => {
    const titles = (key: Parameters<typeof queryTracks>[2]) => queryTracks(list, '', key, 'it').map((t) => t.n);
    expect(titles({ key: 'custom', descending: false })).toEqual(['Ça plane pour moi', 'Anthem', 'blue']);
    expect(titles({ key: 'title', descending: false })).toEqual(['Anthem', 'blue', 'Ça plane pour moi']);
    expect(titles({ key: 'artist', descending: false })).toEqual(['blue', 'Ça plane pour moi', 'Anthem']);
    expect(titles({ key: 'added', descending: true })).toEqual(['Ça plane pour moi', 'blue', 'Anthem']);
    expect(titles({ key: 'duration', descending: false })).toEqual(['Ça plane pour moi', 'blue', 'Anthem']);
    expect(list.map((t) => t.n)).toEqual(['Ça plane pour moi', 'Anthem', 'blue']);
  });

  it('flips the direction when the same order is chosen again', () => {
    expect(nextSort({ key: 'custom', descending: false }, 'title')).toEqual({ key: 'title', descending: false });
    expect(nextSort({ key: 'title', descending: false }, 'title')).toEqual({ key: 'title', descending: true });
    expect(nextSort({ key: 'title', descending: true }, 'added')).toEqual({ key: 'added', descending: true });
    expect(nextSort({ key: 'added', descending: true }, 'custom')).toEqual({ key: 'custom', descending: false });
  });
});

describe('playlist pages', () => {
  it('parses fetchPlaylist and fetchPlaylistContents pages', () => {
    const first = fixture('fetchPlaylist.liked-songs.first-page.json');
    const firstVars = { ...(first.request.variables as object), uri: PLAYLIST };
    const page = parsePlaylistPage(firstVars, first.response.json.data)!;
    expect(page.offset).toBe(0);
    expect(page.total).toBe(1218);
    expect(page.items).toHaveLength(3);
    const item = page.items[0]!;
    expect(item.t).toMatch(/^[A-Za-z0-9]{22}$/);
    expect(item.u).toBeTruthy();
    expect(item.n).not.toBe('');
    expect(item.ms).toBeGreaterThan(0);
    expect(item.d).toBeGreaterThan(0);

    const next = fixture('fetchPlaylistContents.liked-songs.next-page.json');
    const nextPage = parsePlaylistPage({ ...(next.request.variables as object), uri: PLAYLIST }, next.response.json.data)!;
    expect(nextPage.offset).toBe(25);
    expect(parsePlaylistPage({ uri: 'spotify:album:x' }, first.response.json.data)).toBeNull();
  });
});

function page(offset: number, total: number, count: number, revision?: string) {
  return {
    playlistV2: {
      ...(revision ? { revisionId: revision } : {}),
      content: {
        totalCount: total,
        pagingInfo: { offset, limit: count },
        items: Array.from({ length: count }, (_, i) => ({
          uid: `u${offset + i}`,
          addedAt: { isoString: '2026-01-01T00:00:00Z' },
          itemV2: { __typename: 'TrackResponseWrapper', data: { __typename: 'Track', uri: `spotify:track:${id(offset + i)}`, name: `Song ${offset + i}`, artists: { items: [] } } },
        })),
      },
    },
  };
}

function clientFor(total: number) {
  const query = vi.fn(async (_op: string, variables: Record<string, unknown>) => {
    const offset = variables['offset'] as number;
    const count = Math.max(0, Math.min(variables['limit'] as number, total - offset));
    return { status: 200, data: page(offset, total, count), errors: [] };
  });
  return { client: { query } as unknown as PathfinderClient, query };
}

describe('PlaylistStore', () => {
  it('uses the pages the player loaded and fetches only the rest', async () => {
    const { client, query } = clientFor(80);
    const store = new PlaylistStore(client);
    store.observePage({ uri: PLAYLIST, offset: 0, limit: 25 }, page(0, 80, 25));
    const contents = await store.load(PLAYLIST);
    expect(contents.tracks).toHaveLength(80);
    expect(contents.partial).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![1]).toMatchObject({ uri: PLAYLIST, offset: 25, limit: 1000 });
    await store.load(PLAYLIST);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('needs no request when the player loaded everything', async () => {
    const { client, query } = clientFor(10);
    const store = new PlaylistStore(client);
    store.observePage({ uri: PLAYLIST, offset: 0, limit: 25 }, page(0, 10, 10));
    expect((await store.load(PLAYLIST)).tracks).toHaveLength(10);
    expect(query).not.toHaveBeenCalled();
  });

  it('drops the cache on writes to the playlist and on a new revision', async () => {
    const { client, query } = clientFor(10);
    const store = new PlaylistStore(client);
    await store.load(PLAYLIST);
    store.observeRequest('fetchPlaylistContents', { uri: PLAYLIST });
    await store.load(PLAYLIST);
    expect(query).toHaveBeenCalledTimes(1);
    store.observeRequest('addToPlaylist', { playlistUri: PLAYLIST, uris: [] });
    await store.load(PLAYLIST);
    expect(query).toHaveBeenCalledTimes(2);
    store.observePage({ uri: PLAYLIST, offset: 0, limit: 25 }, page(0, 10, 10, 'r1'));
    store.observePage({ uri: PLAYLIST, offset: 0, limit: 5 }, page(0, 10, 5, 'r2'));
    await store.load(PLAYLIST);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('stops at MAX_ITEMS on huge playlists', async () => {
    const { client, query } = clientFor(MAX_ITEMS + 500);
    const contents = await new PlaylistStore(client).load(PLAYLIST);
    expect(contents.tracks).toHaveLength(MAX_ITEMS);
    expect(contents.partial).toBe(true);
    expect(query).toHaveBeenCalledTimes(MAX_ITEMS / 1000);
  });
});

describe('PlaylistToolsFeature on a page', () => {
  function buildPage(): HTMLElement {
    document.documentElement.lang = 'it';
    document.body.innerHTML = `
      <main><section data-testid="playlist-page">
        <div data-testid="action-bar"><div data-testid="action-bar-row"><div data-testid="action-bar-row-trailing"><div id="view"><button role="combobox" aria-haspopup="true">Elenco</button></div></div></div></div>
        <div><div id="wrapper"><div role="grid" data-testid="playlist-tracklist">
          <div role="row"><div data-testid="tracklist-row"><a data-testid="internal-track-link" href="/track/x"><div class="row-title">Song</div></a><div>3:00</div></div></div>
        </div></div></div>
      </section></main>`;
    return document.querySelector('section')!;
  }
  const frame = () => new Promise((resolve) => setTimeout(resolve, 40));

  function setup() {
    const tracks: PlaylistTrack[] = list.map((t) => ({ ...t, u: t.u! }));
    const store = { load: vi.fn(async () => ({ tracks, total: 3, partial: false })), observePage: vi.fn(), observeRequest: vi.fn(), invalidate: vi.fn() };
    const library = { subscribe: () => () => {}, ensureFresh: async () => {}, isLiked: (t: string) => t === id(2), index: null, profileUri: null } as unknown as LikedLibrary;
    const playback = { play: vi.fn(async () => {}), queue: vi.fn(async () => true) } as unknown as Playback;
    const feature = new PlaylistToolsFeature({ library, playback, store: store as unknown as PlaylistStore, albums: {} as AlbumStore });
    return { feature, store, playback };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('adds the controls, leaves the native list alone until a search, and restores it after', async () => {
    const section = buildPage();
    const { feature, store, playback } = setup();
    feature.enable();
    feature.onPageChange({ kind: 'playlist', id: 'P'.repeat(22) });
    await frame();
    const trailing = section.querySelector('[data-testid="action-bar-row-trailing"]')!;
    expect(trailing.firstElementChild?.hasAttribute('data-sfe-playlist-tools')).toBe(true);
    expect(store.load).not.toHaveBeenCalled();
    expect(section.querySelector('#wrapper')!.getAttribute('style')).toBeNull();

    const input = trailing.querySelector('input')!;
    input.value = 'angels';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await frame();
    const wrapper = section.querySelector<HTMLElement>('#wrapper')!;
    expect(wrapper.style.display).toBe('none');
    const ours = section.querySelector('[data-sfe-playlist-list]')!;
    expect(wrapper.nextElementSibling).toBe(ours);
    expect([...ours.querySelectorAll('li')].map((li) => li.textContent)).toEqual([expect.stringContaining('blue')]);

    ours.querySelector('li')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(playback.play).toHaveBeenCalledWith({ trackId: id(3), title: 'blue', contexts: [PLAYLIST], uid: 'uid3' });

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await frame();
    expect(wrapper.style.display).toBe('');
    expect(section.querySelector('[data-sfe-playlist-list]')).toBeNull();
    feature.disable();
    expect(trailing.querySelector('[data-sfe-playlist-tools]')).toBeNull();
  });

  it('follows the player when it replaces the page section (playlist to playlist)', async () => {
    buildPage();
    const { feature } = setup();
    feature.enable();
    feature.onPageChange({ kind: 'playlist', id: 'P'.repeat(22) });
    await frame();
    feature.onPageChange({ kind: 'playlist', id: 'Q'.repeat(22) });
    const main = document.querySelector('main')!;
    const fresh = buildPage().outerHTML;
    main.innerHTML = fresh.replace(/^<main>|<\/main>$/g, '');
    document.body.replaceChildren(main);
    await frame();
    const trailing = document.querySelector('[data-testid="action-bar-row-trailing"]')!;
    expect(trailing.firstElementChild?.hasAttribute('data-sfe-playlist-tools')).toBe(true);
    expect(document.querySelectorAll('[data-sfe-playlist-tools]')).toHaveLength(1);
    feature.disable();
  });

  it('sorts from the menu and the headers, and leaves no trace on another page', async () => {
    const section = buildPage();
    const { feature } = setup();
    feature.enable();
    feature.onPageChange({ kind: 'playlist', id: 'P'.repeat(22) });
    await frame();
    const sortButton = section.querySelector<HTMLButtonElement>('[data-sfe-playlist-tools] button[aria-haspopup="menu"]')!;
    expect(sortButton.textContent).toBe('Ordine personalizzato');
    sortButton.click();
    [...document.querySelectorAll<HTMLButtonElement>('[data-sfe-liked-menu] button')].find((b) => b.textContent === 'Titolo')!.click();
    await frame();
    await frame();
    const names = () => [...section.querySelectorAll('[data-sfe-playlist-list] li a[href^="/track/"]')].map((a) => a.textContent);
    expect(names()).toEqual(['Anthem', 'blue', 'Ça plane pour moi']);
    expect(sortButton.textContent).toBe('Titolo');
    section.querySelector<HTMLElement>('[data-sfe-playlist-list] [role="button"]:nth-child(2)')!.click();
    await frame();
    expect(names()).toEqual(['Ça plane pour moi', 'blue', 'Anthem']);

    feature.onPageChange({ kind: 'album', id: 'A'.repeat(22) });
    expect(section.querySelector('[data-sfe-playlist-list]')).toBeNull();
    expect(section.querySelector('[data-sfe-playlist-tools]')).toBeNull();
    expect(section.querySelector<HTMLElement>('#wrapper')!.style.display).toBe('');
  });
});

describe('desktop look', () => {
  it('highlights the searched words, ignoring case and accents', () => {
    const host = document.createElement('div');
    host.append(highlighted('Ça plane pour moi', 'ca moi'));
    expect([...host.querySelectorAll('span')].map((span) => span.textContent)).toEqual(['Ça', 'moi']);
    expect(host.textContent).toBe('Ça plane pour moi');
    expect(highlighted('Anthem', 'zzz').nodeType).toBe(Node.TEXT_NODE);
  });

  it('offers the Liked Songs orders, newest first by default, behind one button that replaces "view as"', async () => {
    document.documentElement.lang = 'it';
    document.body.innerHTML = `
      <main><section data-testid="playlist-page">
        <div data-testid="action-bar-row-trailing"><div id="view"><button role="combobox" aria-haspopup="true">Elenco</button></div></div>
        <div><div id="wrapper"><div role="grid" data-testid="track-list">
          <div role="row"><div data-testid="tracklist-row"><a data-testid="internal-track-link" href="/track/x"><div>Song</div></a><div>3:00</div></div></div>
        </div></div></div>
      </section></main>`;
    const section = document.querySelector('section')!;
    const store = { load: vi.fn(), observePage: vi.fn(), observeRequest: vi.fn(), invalidate: vi.fn() };
    const library = { subscribe: () => () => {}, ensureFresh: async () => {}, isLiked: () => true, index: { tracks: list }, profileUri: null } as unknown as LikedLibrary;
    const feature = new PlaylistToolsFeature({ library, playback: {} as Playback, store: store as unknown as PlaylistStore, albums: {} as AlbumStore });
    feature.enable();
    feature.onPageChange({ kind: 'collection', id: 'tracks' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(section.querySelector<HTMLElement>('#view')!.style.display).toBe('none');
    const button = section.querySelector<HTMLButtonElement>('[data-sfe-playlist-tools] button[aria-haspopup="menu"]')!;
    expect(button.textContent).toBe('Aggiunti di recente');
    button.click();
    const entries = [...document.querySelectorAll('[data-sfe-liked-menu] li')].map((li) => li.textContent);
    expect(entries).toEqual(['Ordina per', 'Titolo', 'Aggiunti di recente', 'Artista', 'Album', 'Visualizza come', 'Compatta', 'Elenco']);
    expect(document.querySelector('[data-sfe-liked-menu] button[aria-checked="true"]')?.textContent).toBe('Aggiunti di recente');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(section.querySelector('[data-sfe-playlist-list]')).toBeNull();
    expect(store.load).not.toHaveBeenCalled();
    feature.disable();
    expect(section.querySelector<HTMLElement>('#view')!.style.display).toBe('');
  });
});
