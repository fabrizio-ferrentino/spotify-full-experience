// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALBUM_PAGE_MAX, parseAlbumPage, type AlbumTrack } from '../../src/page/adapters/libraryShapes';
import type { PathfinderClient } from '../../src/page/core/pathfinderClient';
import { PlaylistToolsFeature } from '../../src/page/features/playlist-tools';
import { AlbumStore } from '../../src/page/features/playlist-tools/albumStore';
import { nextSort, queryTracks } from '../../src/page/features/playlist-tools/listQuery';
import type { PlaylistStore } from '../../src/page/features/playlist-tools/playlistStore';
import type { LikedLibrary } from '../../src/page/library/likedLibrary';
import type { Playback } from '../../src/page/library/playback';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pathfinder');
const getAlbum = JSON.parse(readFileSync(path.join(dir, 'getAlbum.i-empire.json'), 'utf8')) as {
  request: { variables: { uri: string } };
  response: { json: { data: unknown } };
};

const ALBUM_ID = 'A'.repeat(22);
const ALBUM = `spotify:album:${ALBUM_ID}`;
const id = (n: number) => `T${String(n).padStart(21, '0')}`;

function albumTrack(n: number, name: string, plays: number | null, ms = 200_000): AlbumTrack {
  return { t: id(n), a: null, d: 0, n: name, ar: ['Band'], ad: [null], al: 'Record', ai: ALBUM_ID, c: '', ms, e: false, u: `uid${n}`, p: plays };
}

/** `data` of getAlbum (with name) or queryAlbumTracks (tracks only). */
function albumData(offset: number, total: number, count: number, name?: string) {
  const items = Array.from({ length: count }, (_, i) => ({
    uid: `uid${offset + i}`,
    track: {
      uri: `spotify:track:${id(offset + i)}`,
      name: `Song ${offset + i}`,
      artists: { items: [{ uri: `spotify:artist:${'B'.repeat(22)}`, profile: { name: 'Band' } }] },
      duration: { totalMilliseconds: 1000 * (offset + i + 1) },
      playcount: String(10 * (offset + i)),
      discNumber: 1,
      trackNumber: offset + i + 1,
    },
  }));
  return {
    albumUnion: {
      ...(name ? { name, coverArt: { sources: [{ url: 'https://i.scdn.co/image/small', width: 64 }] } } : {}),
      tracksV2: { totalCount: total, items },
    },
  };
}

describe('album pages', () => {
  it('parses getAlbum: play counts, row IDs, album name and cover', () => {
    const page = parseAlbumPage(getAlbum.request.variables, getAlbum.response.json.data)!;
    expect(page.uri).toBe(getAlbum.request.variables.uri);
    expect(page.offset).toBe(0);
    expect(page.total).toBe(13);
    expect(page.name).toBe('I-Empire');
    expect(page.items).toHaveLength(13);
    const first = page.items[0]!;
    expect(first).toMatchObject({ t: '3lGUSc1x03KLsxKuyIEYf1', n: 'Call To Arms', ar: ['Angels & Airwaves'], ms: 305_320, p: 16_578_691, u: '0c1dde1cc5c13a5a6b03' });
    expect(first.ai).toBe(page.uri.split(':')[2]);
    expect(first.al).toBe('I-Empire');
    expect(first.c).toMatch(/^https:\/\//);
  });

  it('parses queryAlbumTracks pages, which have no album name', () => {
    const page = parseAlbumPage({ uri: ALBUM, offset: 50, limit: 50 }, albumData(50, 60, 10))!;
    expect(page).toMatchObject({ uri: ALBUM, offset: 50, total: 60, name: null });
    expect(page.items[0]).toMatchObject({ t: id(50), p: 500, u: 'uid50', ai: ALBUM_ID, al: '' });
  });

  it('rejects other shapes and keeps unknown play counts as null', () => {
    expect(parseAlbumPage({ uri: 'spotify:playlist:x' }, albumData(0, 1, 1))).toBeNull();
    expect(parseAlbumPage({ uri: ALBUM }, { albumUnion: {} })).toBeNull();
    const data = albumData(0, 1, 1);
    (data.albumUnion.tracksV2.items[0]!.track as { playcount?: string }).playcount = '';
    expect(parseAlbumPage({ uri: ALBUM }, data)!.items[0]!.p).toBeNull();
  });
});

describe('sort by plays', () => {
  const tracks = [albumTrack(1, 'One', 50), albumTrack(2, 'Two', null), albumTrack(3, 'Three', 900), albumTrack(4, 'Four', 50)];

  it('starts with the most played, ties in album order, unknown counts last both ways', () => {
    const sort = nextSort({ key: 'custom', descending: false }, 'plays');
    expect(sort).toEqual({ key: 'plays', descending: true });
    expect(queryTracks(tracks, '', sort, 'en').map((t) => t.n)).toEqual(['Three', 'One', 'Four', 'Two']);
    expect(queryTracks(tracks, '', nextSort(sort, 'plays'), 'en').map((t) => t.n)).toEqual(['One', 'Four', 'Three', 'Two']);
    expect(tracks.map((t) => t.n)).toEqual(['One', 'Two', 'Three', 'Four']);
  });
});

describe('AlbumStore', () => {
  function clientFor(total: number) {
    const query = vi.fn(async (_operation: string, variables: Record<string, unknown>) => {
      const offset = variables['offset'] as number;
      const limit = variables['limit'] as number;
      return { status: 200, data: albumData(offset, total, Math.max(0, Math.min(limit, total - offset))), errors: [] };
    });
    return { client: { query } as unknown as PathfinderClient, query };
  }

  it('uses the pages the player loaded and fetches the rest with queryAlbumTracks', async () => {
    const { client, query } = clientFor(400);
    const store = new AlbumStore(client);
    store.observePage({ uri: ALBUM, offset: 0, limit: 50 }, albumData(0, 400, 50, 'Box Set'));
    const contents = await store.load(ALBUM);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(1, 'queryAlbumTracks', { uri: ALBUM, offset: 50, limit: ALBUM_PAGE_MAX });
    expect(query).toHaveBeenNthCalledWith(2, 'queryAlbumTracks', { uri: ALBUM, offset: 50 + ALBUM_PAGE_MAX, limit: ALBUM_PAGE_MAX });
    expect(contents.tracks).toHaveLength(400);
    expect(contents.partial).toBe(false);
    // Rows from queryAlbumTracks take the album name and cover from getAlbum.
    expect(contents.tracks[399]).toMatchObject({ al: 'Box Set', c: 'https://i.scdn.co/image/small', p: 3990 });
  });

  it('needs no request when the player loaded everything, and loads again after 15 minutes', async () => {
    const { client, query } = clientFor(10);
    let now = 0;
    const store = new AlbumStore(client, () => now);
    store.observePage({ uri: ALBUM, offset: 0, limit: 50 }, albumData(0, 10, 10, 'Record'));
    expect((await store.load(ALBUM)).tracks).toHaveLength(10);
    expect(query).not.toHaveBeenCalled();
    now = 16 * 60_000;
    await store.load(ALBUM);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('PlaylistToolsFeature on an album page', () => {
  function buildPage(): HTMLElement {
    document.documentElement.lang = 'it';
    document.body.innerHTML = `
      <main><section data-testid="album-page">
        <div data-testid="action-bar-row-trailing"><div id="view"><button role="combobox" aria-haspopup="true">Elenco</button></div></div>
        <div><div id="wrapper"><div role="grid" data-testid="track-list">
          <div role="row"><div data-testid="tracklist-row"><a data-testid="internal-track-link" href="/track/x"><div>Song</div></a><div>3:00</div></div></div>
        </div></div></div>
        <section data-testid="component-shelf"><div role="grid" data-testid="track-list"></div></section>
      </section></main>`;
    return document.querySelector('section')!;
  }
  const frame = () => new Promise((resolve) => setTimeout(resolve, 40));

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sorts by plays with a plays column, plays in the album context, and restores the album order', async () => {
    const section = buildPage();
    const tracks = [albumTrack(1, 'One', 50), albumTrack(2, 'Two', 1_234_567), albumTrack(3, 'Three', null)];
    const albums = { load: vi.fn(async () => ({ tracks, total: 3, partial: false })), observePage: vi.fn() };
    const library = { subscribe: () => () => {}, ensureFresh: async () => {}, isLiked: (t: string) => t === id(2), index: null, profileUri: null } as unknown as LikedLibrary;
    const playback = { play: vi.fn(async () => {}), queue: vi.fn(async () => true) } as unknown as Playback;
    const feature = new PlaylistToolsFeature({ library, playback, store: {} as PlaylistStore, albums: albums as unknown as AlbumStore });
    feature.enable();
    feature.onPageChange({ kind: 'album', id: ALBUM_ID });
    await frame();

    const button = section.querySelector<HTMLButtonElement>('[data-sfe-playlist-tools] button[aria-haspopup="menu"]')!;
    expect(button.textContent).toBe("Ordine dell'album");
    expect(albums.load).not.toHaveBeenCalled();
    button.click();
    const entries = [...document.querySelectorAll('[data-sfe-liked-menu] li')].map((li) => li.textContent);
    expect(entries.slice(0, 5)).toEqual(['Ordina per', "Ordine dell'album", 'Riproduzioni', 'Titolo', 'Durata']);
    [...document.querySelectorAll<HTMLButtonElement>('[data-sfe-liked-menu] button')].find((b) => b.textContent === 'Riproduzioni')!.click();
    await frame();
    await frame();

    expect(albums.load).toHaveBeenCalledWith(ALBUM);
    const wrapper = section.querySelector<HTMLElement>('#wrapper')!;
    expect(wrapper.style.display).toBe('none');
    const ours = section.querySelector('[data-sfe-playlist-list]')!;
    expect(wrapper.nextElementSibling).toBe(ours);
    const head = [...ours.firstElementChild!.children].map((cell) => cell.textContent);
    expect(head.slice(0, 3)).toEqual(['#', 'Titolo', 'Riproduzioni']);
    const rows = [...ours.querySelectorAll('li')];
    expect(rows.map((li) => li.querySelector('a[href^="/track/"]')!.textContent)).toEqual(['Two', 'One', 'Three']);
    expect(rows[0]!.textContent).toContain('1.234.567');
    expect(rows[0]!.querySelector('img')).toBeNull();
    // Like the player's rows: the green tick of a liked song is always shown, the "+" only on hover.
    const tick = (row: Element) => row.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')!.style.opacity;
    expect(rows.map(tick)).toEqual(['1', '0', '0']);

    rows[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(playback.play).toHaveBeenCalledWith({ trackId: id(2), title: 'Two', contexts: [ALBUM], uid: 'uid2' });

    button.click();
    [...document.querySelectorAll<HTMLButtonElement>('[data-sfe-liked-menu] button')].find((b) => b.textContent === "Ordine dell'album")!.click();
    await frame();
    expect(section.querySelector('[data-sfe-playlist-list]')).toBeNull();
    expect(wrapper.style.display).toBe('');
    feature.disable();
  });
});
