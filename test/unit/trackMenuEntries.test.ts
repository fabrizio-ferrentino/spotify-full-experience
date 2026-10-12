// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectionUrl,
  creditsVariables,
  parseContains,
  parseCredits,
  parseSongRadio,
  songRadioUrl,
  tasteProfileBody,
  usernameOf,
} from '../../src/page/adapters/trackShapes';
import type { PathfinderClient } from '../../src/page/core/pathfinderClient';
import type { Session } from '../../src/page/core/session';
import { SpclientRequests } from '../../src/page/core/spclient';
import { LikedSongsView, type RowActions } from '../../src/page/features/artist-liked-songs/view';
import { TrackActions } from '../../src/page/library/trackActions';
import type { LikedTrack } from '../../src/shared/likedIndex';

const TRACK = 'A'.repeat(22);
const ARTIST = 'B'.repeat(22);
const RADIO = 'R'.repeat(22);

/** Same paths as the player's credits response (checked live on 2026-10-12). */
const creditsData = {
  trackUnion: {
    __typename: 'Track',
    name: 'Shove',
    artists: { items: [{ uri: `spotify:artist:${ARTIST}` }] },
    creditsTrait: {
      contributors: {
        items: [
          { name: 'Angels & Airwaves', role: 'Main Artist', roleGroup: { name: 'Artist' }, uri: `spotify:artist:${ARTIST}`, url: null },
          { name: 'Tom DeLonge', role: 'Composer', roleGroup: { name: 'Composition & Lyrics' }, uri: null, url: null },
          { name: 'Adam Willard', role: 'Composer', roleGroup: { name: 'Composition & Lyrics' }, uri: null, url: null },
          { name: 'Tom DeLonge', role: 'Producer', roleGroup: { name: 'Production & Engineering' }, uri: null, url: null },
        ],
      },
      sources: { items: [{ name: 'To The Stars Records' }] },
    },
  },
};

describe('player requests behind the menu entries', () => {
  it('song radio: the player URL, and the radio playlist from the response', () => {
    expect(songRadioUrl(TRACK)).toBe(`https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/spotify:track:${TRACK}?response-format=json`);
    expect(parseSongRadio({ mediaItems: [{ uri: `spotify:playlist:${RADIO}` }], total: 1 })).toBe(RADIO);
    expect(parseSongRadio({ mediaItems: [] })).toBeNull();
    expect(parseSongRadio(null)).toBeNull();
  });

  it('taste profile: the collection set, exclude and include bodies, contains', () => {
    expect(collectionUrl('write')).toBe('https://spclient.wg.spotify.com/collection/v2/write?market=from_token');
    expect(tasteProfileBody('me', TRACK)).toEqual({ username: 'me', set: 'ignoreinrecs', items: [{ uri: `spotify:track:${TRACK}` }] });
    expect(tasteProfileBody('me', TRACK, true)).toEqual({ username: 'me', set: 'ignoreinrecs', items: [{ uri: `spotify:track:${TRACK}`, is_removed: true }] });
    expect(parseContains({ found: [true] })).toBe(true);
    expect(parseContains({ found: [] })).toBeNull();
    expect(usernameOf('spotify:user:someone')).toBe('someone');
    expect(usernameOf('spotify:artist:x')).toBeNull();
  });

  it('credits: the player variables, and role groups in order', () => {
    expect(creditsVariables(TRACK)).toEqual({ trackUri: `spotify:track:${TRACK}`, contributorsLimit: 100, contributorsOffset: 0 });
    const credits = parseCredits(creditsData)!;
    expect(credits.title).toBe('Shove');
    expect(credits.groups.map((g) => [g.name, g.people.map((p) => p.name)])).toEqual([
      ['Artist', ['Angels & Airwaves']],
      ['Composition & Lyrics', ['Tom DeLonge', 'Adam Willard']],
      ['Production & Engineering', ['Tom DeLonge']],
    ]);
    expect(credits.groups[0]!.people[0]).toEqual({ name: 'Angels & Airwaves', role: 'Main Artist', artistId: ARTIST });
    expect(credits.sources).toEqual(['To The Stars Records']);
    expect(parseCredits({ trackUnion: {} })).toBeNull();
  });
});

describe('SpclientRequests', () => {
  const session = (ready = true) => ({ requestHeaders: () => (ready ? { authorization: 'x' } : null) }) as unknown as Session;

  it('sends with the session headers, spaces requests, and maps failures to null', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Response('', { status: 200 }) : new Response('{"a":1}', { status: 200 }),
    );
    const sleep = vi.fn(async () => {});
    const requests = new SpclientRequests(fetchFn as unknown as typeof fetch, session(), sleep, () => 1000);
    expect(await requests.get('https://x/get')).toEqual({ a: 1 });
    expect(await requests.post('https://x/post', { b: 2 })).toEqual({});
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://x/post', { method: 'POST', body: '{"b":2}', headers: { authorization: 'x' } });
    expect(sleep).toHaveBeenCalledTimes(1);
    fetchFn.mockImplementationOnce(async () => new Response('', { status: 500 }));
    expect(await requests.get('https://x/fail')).toBeNull();
    expect(await new SpclientRequests(fetchFn as unknown as typeof fetch, session(false)).get('https://x')).toBeNull();
  });
});

describe('TrackActions', () => {
  function setup(profile: string | null = 'spotify:user:someone') {
    const spclient = {
      get: vi.fn(async () => ({ mediaItems: [{ uri: `spotify:playlist:${RADIO}` }] })),
      post: vi.fn(async (url: string) => (url.includes('contains') ? { found: [true] } : {})),
    };
    const client = { query: vi.fn(async () => ({ status: 200, data: creditsData, errors: [] })) };
    const actions = new TrackActions({
      spclient: spclient as unknown as SpclientRequests,
      client: client as unknown as PathfinderClient,
      profileUri: () => profile,
    });
    return { actions, spclient, client };
  }

  it('opens the song radio inside the app', async () => {
    const { actions, spclient } = setup();
    expect(await actions.songRadio(TRACK)).toBe(true);
    expect(spclient.get).toHaveBeenCalledWith(songRadioUrl(TRACK));
    expect(location.pathname).toBe(`/playlist/${RADIO}`);
  });

  it('reads and changes the taste profile with the user name, never without it', async () => {
    const { actions, spclient } = setup();
    expect(await actions.isExcluded(TRACK)).toBe(true);
    expect(await actions.setExcluded(TRACK, false)).toBe(true);
    expect(spclient.post).toHaveBeenLastCalledWith(collectionUrl('write'), tasteProfileBody('someone', TRACK, true));
    const anonymous = setup(null);
    expect(await anonymous.actions.isExcluded(TRACK)).toBeNull();
    expect(await anonymous.actions.setExcluded(TRACK, true)).toBe(false);
    expect(anonymous.spclient.post).not.toHaveBeenCalled();
  });

  it('loads the credits with the player query', async () => {
    const { actions, client } = setup();
    expect((await actions.credits(TRACK)).title).toBe('Shove');
    expect(client.query).toHaveBeenCalledWith('queryTrackCreditsGroupedModal', creditsVariables(TRACK));
  });
});

describe('row menu entries', () => {
  const track: LikedTrack = { t: TRACK, a: ARTIST, d: 0, n: 'Shove', ar: ['Angels & Airwaves'], ad: [ARTIST], al: 'Love', ai: 'L'.repeat(22), c: '', ms: 1000, e: false };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const entries = () => [...document.querySelectorAll('[data-sfe-liked-menu] li')].map((li) => li.textContent);

  function open(actions: Partial<RowActions>) {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '<main></main>';
    const view = new LikedSongsView(document.querySelector('main')!, { heading: '', title: '', subdued: '' }, () => {}, actions);
    view.open({ artistId: ARTIST, artistName: 'Angels & Airwaves', imageUrl: null, tracks: [track], now: 0 });
    return view.root.querySelector('li')!;
  }

  afterEach(() => {
    // Close what a test left open (menus listen on the document).
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.body.innerHTML = '';
  });

  function actions(excluded: boolean | null) {
    return {
      play: vi.fn(),
      queue: vi.fn(async () => true),
      playlists: vi.fn(async () => []),
      curate: vi.fn(async () => true),
      radio: vi.fn(async () => true),
      credits: vi.fn(async () => parseCredits(creditsData)!),
      isExcluded: vi.fn(async () => excluded),
      setExcluded: vi.fn(async () => true),
      openInDesktop: vi.fn(),
    };
  }

  it('follows the player menu order, with the taste profile entry matching the state', async () => {
    const a = actions(false);
    const row = open(a);
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await flush();
    expect(entries()).toEqual([
      'Add to playlist',
      'Remove from your Liked Songs',
      'Add to queue',
      'Exclude from your taste profile',
      'Go to song radio',
      'Go to artist',
      'Go to album',
      'View credits',
      'Share',
      'Open in Desktop app',
    ]);
    [...document.querySelectorAll<HTMLButtonElement>('[data-sfe-liked-menu] button')].find((b) => b.textContent === 'Exclude from your taste profile')!.click();
    expect(a.setExcluded).toHaveBeenCalledWith(track, true);

    const b = actions(true);
    open(b).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await flush();
    expect(entries()).toContain('Include in your taste profile');

    // Unknown state: no taste profile entry rather than a wrong one.
    open(actions(null)).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await flush();
    expect(entries().some((e) => e?.includes('taste profile'))).toBe(false);
  });

  it('shows the credits in a dialog, grouped like the player', async () => {
    const a = actions(false);
    open(a).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await flush();
    [...document.querySelectorAll<HTMLButtonElement>('[data-sfe-liked-menu] button')].find((b) => b.textContent === 'View credits')!.click();
    await flush();
    const dialog = document.querySelector('[data-sfe-credits] [role="dialog"]')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Credits');
    expect([...dialog.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Artist', 'Composition & Lyrics', 'Production & Engineering']);
    expect(dialog.querySelector(`a[href="/artist/${ARTIST}"]`)!.textContent).toBe('Angels & Airwaves');
    expect(dialog.textContent).toContain('Source: To The Stars Records');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[data-sfe-credits]')).toBeNull();
  });
});
