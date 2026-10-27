import { describe, expect, it, vi } from 'vitest';
import {
  curationVariables,
  parseArtistOverview,
  parseCurationResult,
  parseEditablePlaylists,
  parseLibraryChange,
  parseLibraryPage,
  parseProfileUri,
} from '../../src/page/adapters/libraryShapes';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, CHECK_PAGE_SIZE, isStale, refreshIndex, removeTracks, tracksByArtist, REFRESH_AFTER_MS, type FetchPage } from '../../src/page/library/indexSync';
import { MAX_INDEX_TRACKS, parseLikedIndex, type LikedIndex, type LikedTrack } from '../../src/shared/likedIndex';
import { LikedLibrary } from '../../src/page/library/likedLibrary';
import type { PathfinderClient } from '../../src/page/core/pathfinderClient';
import type { CapturedRequest } from '../../src/page/core/interceptor';
import { BRIDGE_NAMESPACE, parseContentToPage, parsePageToContent } from '../../src/shared/protocol';

// Synthetic IDs (22 base62 chars) and data shaped like the live responses (docs/phase2-findings.md).
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(21 - prefix.length + 1, '0')}`.slice(0, 22).padEnd(22, 'x');
const TRACK = (n: number) => id('T', n);
const ARTIST = (n: number) => id('A', n);

function libraryItem(n: number, artists: number[], addedAt: number) {
  return {
    __typename: 'UserLibraryTrackResponse',
    addedAt: { isoString: new Date(addedAt).toISOString() },
    track: {
      _uri: `spotify:track:${TRACK(n)}`,
      data: {
        __typename: 'Track',
        name: `Song ${n}`,
        albumOfTrack: {
          name: `Album ${n}`,
          uri: `spotify:album:${id('L', n)}`,
          coverArt: { sources: [{ url: 'https://i/300', width: 300 }, { url: 'https://i/64', width: 64 }] },
        },
        duration: { totalMilliseconds: 394653 },
        contentRating: { label: n % 2 ? 'EXPLICIT' : 'NONE' },
        artists: { items: artists.map((a) => ({ uri: `spotify:artist:${ARTIST(a)}`, profile: { name: `Artist ${a}` } })) },
      },
    },
  };
}

function libraryData(items: unknown[], total: number) {
  return { me: { library: { tracks: { __typename: 'UserLibraryTrackPage', totalCount: total, pagingInfo: { offset: 0, limit: items.length }, items } } } };
}

/** A fake library: track n (newest first) by artist n % 3, added at time 10_000 - n. */
function fakeLibrary(size: number) {
  const items = Array.from({ length: size }, (_, n) => libraryItem(n, [n % 3, 9], 10_000_000 - n * 1000));
  const fetchPage = vi.fn<FetchPage>(async (offset, limit) => parseLibraryPage(libraryData(items.slice(offset, offset + limit), items.length))!);
  return { items, fetchPage };
}

describe('library shapes', () => {
  it('parses a fetchLibraryTracks page, keeping the first artist as primary', () => {
    const page = parseLibraryPage(libraryData([libraryItem(1, [2, 5], 1000), { track: { _uri: 'spotify:episode:x' } }], 40))!;
    expect(page.total).toBe(40);
    expect(page.itemCount).toBe(2);
    expect(page.tracks).toEqual([
      { t: TRACK(1), a: ARTIST(2), d: 1000, n: 'Song 1', ar: ['Artist 2', 'Artist 5'], ad: [ARTIST(2), ARTIST(5)], al: 'Album 1', ai: id('L', 1), c: 'https://i/64', ms: 394653, e: true },
    ]);
    expect(parseLibraryPage({ me: {} })).toBeNull();
  });

  it('reads the profile URI and the artist overview', () => {
    expect(parseProfileUri({ data: { me: { profile: { uri: 'spotify:user:abc' } } } })).toBe('spotify:user:abc');
    expect(parseProfileUri({})).toBeNull();
    const artist = parseArtistOverview({
      data: {
        artistUnion: {
          uri: `spotify:artist:${ARTIST(1)}`,
          profile: { name: 'Band' },
          visuals: { avatarImage: { sources: [{ url: 'https://i/640', width: 640 }, { url: 'https://i/160', width: 160 }, { url: 'http://insecure', width: 64 }] } },
        },
      },
    });
    expect(artist).toEqual({ id: ARTIST(1), name: 'Band', imageUrl: 'https://i/160' });
  });

  it('recognises likes and unlikes made by the player', () => {
    const uri = `spotify:track:${TRACK(1)}`;
    expect(parseLibraryChange('addToLibrary', { libraryItemUris: [uri], interactionId: 'x' })).toEqual({ kind: 'added', trackIds: [TRACK(1)] });
    const curation = (type: string, context = 'spotify:collection:tracks') => ({ input: { curations: [{ contextUri: context, curationType: type }], itemUris: [uri] } });
    expect(parseLibraryChange('applyCurations', curation('UNCURATE'))).toEqual({ kind: 'removed', trackIds: [TRACK(1)] });
    expect(parseLibraryChange('applyCurations', curation('CURATE'))).toEqual({ kind: 'added', trackIds: [TRACK(1)] });
    expect(parseLibraryChange('applyCurations', curation('UNCURATE', 'spotify:playlist:x'))).toBeNull();
    expect(parseLibraryChange('addToLibrary', { libraryItemUris: ['spotify:album:x'] })).toBeNull();
    expect(parseLibraryChange('getAlbum', {})).toBeNull();
  });
});

describe('index sync', () => {
  it('builds the index with pages of 1000', async () => {
    const { fetchPage } = fakeLibrary(1220);
    const index = await buildIndex(fetchPage, 5);
    expect(fetchPage.mock.calls).toEqual([[0, 1000], [1000, 1000]]);
    expect(index).toMatchObject({ v: 3, checkedAt: 5, total: 1220 });
    expect(index.tracks).toHaveLength(1220);
    expect(index.tracks[0]!.t).toBe(TRACK(0));
  });

  it('prepends new likes after a check of the first page', async () => {
    const library = fakeLibrary(100);
    const old = await buildIndex(async (o, l) => parseLibraryPage(libraryData(library.items.slice(3).slice(o, o + l), 97))!, 0);
    const { index, mode } = await refreshIndex(old, library.fetchPage, 99);
    expect(mode).toBe('incremental');
    expect(library.fetchPage.mock.calls).toEqual([[0, CHECK_PAGE_SIZE]]);
    expect(index.total).toBe(100);
    expect(index.tracks.map((t) => t.t)).toEqual(library.items.map((_, n) => TRACK(n)));
    expect(index.checkedAt).toBe(99);
  });

  it('rebuilds when the counts do not add up (unlike elsewhere) or the newest like is gone', async () => {
    const library = fakeLibrary(100);
    const full = await buildIndex(library.fetchPage, 0);
    // An unlike made on another device: same newest track, smaller total.
    const shorter = fakeLibrary(100);
    shorter.items.splice(50, 1);
    const fetchShorter: FetchPage = async (o, l) => parseLibraryPage(libraryData(shorter.items.slice(o, o + l), 99))!;
    expect((await refreshIndex(full, fetchShorter, 1)).mode).toBe('rebuild');
    // Another account: nothing in common.
    const other: FetchPage = async (o, l) => parseLibraryPage(libraryData([libraryItem(500, [1], 1)].slice(o, o + l), 1))!;
    const rebuilt = await refreshIndex(full, other, 2);
    expect(rebuilt).toMatchObject({ mode: 'rebuild', index: { total: 1 } });
  });

  it('applies unlikes locally and counts only the primary artist', async () => {
    const { fetchPage } = fakeLibrary(9);
    const index = await buildIndex(fetchPage, 0);
    expect(tracksByArtist(index, ARTIST(0)).map((t) => t.t)).toEqual([TRACK(0), TRACK(3), TRACK(6)]);
    expect(tracksByArtist(index, ARTIST(9))).toEqual([]); // featured on every track, never primary
    const after = removeTracks(index, [TRACK(3), 'unknown']);
    expect(after.total).toBe(8);
    expect(tracksByArtist(after, ARTIST(0)).map((t) => t.t)).toEqual([TRACK(0), TRACK(6)]);
    expect(removeTracks(index, ['unknown'])).toBe(index);
  });

  it('keeps an incrementally refreshed index within the stored limit', async () => {
    const tracks = Array.from({ length: MAX_INDEX_TRACKS }, (_, n) => ({ ...parseLibraryPage(libraryData([libraryItem(n + 2, [1], 1000 - n)], 1))!.tracks[0]! }));
    const full: LikedIndex = { v: 3, checkedAt: 0, total: MAX_INDEX_TRACKS, tracks };
    const head: FetchPage = async () => parseLibraryPage(libraryData([libraryItem(0, [1], 5000), libraryItem(1, [1], 4000), libraryItem(2, [1], 1000)], MAX_INDEX_TRACKS + 2))!;
    const { index, mode } = await refreshIndex(full, head, 1);
    expect(mode).toBe('incremental');
    expect(index.total).toBe(MAX_INDEX_TRACKS + 2);
    expect(index.tracks).toHaveLength(MAX_INDEX_TRACKS);
    expect(index.tracks[0]!.t).toBe(TRACK(0));
    expect(parseLikedIndex(index)).not.toBeNull();
  });

  it('considers an index stale after 10 minutes', () => {
    const index: LikedIndex = { v: 3, checkedAt: 1000, total: 0, tracks: [] };
    expect(isStale(index, 1000 + REFRESH_AFTER_MS)).toBe(false);
    expect(isStale(index, 1001 + REFRESH_AFTER_MS)).toBe(true);
  });
});

describe('stored index validation', () => {
  const track: LikedTrack = { t: TRACK(1), a: ARTIST(1), d: 1, n: 'n', ar: ['x'], ad: [null], al: 'al', ai: null, c: '', ms: 0, e: false };

  it('accepts a well-formed index and rejects anything else as a whole', () => {
    expect(parseLikedIndex({ v: 3, checkedAt: 1, total: 1, tracks: [track] })).toEqual({ v: 3, checkedAt: 1, total: 1, tracks: [track] });
    expect(parseLikedIndex({ v: 3, checkedAt: 1, total: 1, tracks: [{ ...track, a: null }] })?.tracks[0]?.a).toBeNull();
    // Insecure cover URLs are dropped, not trusted.
    expect(parseLikedIndex({ v: 3, checkedAt: 1, total: 1, tracks: [{ ...track, c: 'http://x' }] })?.tracks[0]?.c).toBe('');
    for (const bad of [null, {}, { v: 2, checkedAt: 1, total: 1, tracks: [] }, { v: 3, checkedAt: 1, total: -1, tracks: [] }, { v: 3, checkedAt: 1, total: 1, tracks: [{ ...track, t: 'short' }] }]) {
      expect(parseLikedIndex(bad)).toBeNull();
    }
  });

  it('travels on the bridge only with a hashed key', () => {
    const key = 'a'.repeat(64);
    const index = { v: 3, checkedAt: 1, total: 1, tracks: [track] };
    expect(parsePageToContent({ ns: BRIDGE_NAMESPACE, dir: 'to-content', type: 'load-liked-index', key })).toEqual({ type: 'load-liked-index', key });
    expect(parsePageToContent({ ns: BRIDGE_NAMESPACE, dir: 'to-content', type: 'save-liked-index', key, index })).toEqual({ type: 'save-liked-index', key, index });
    expect(parsePageToContent({ ns: BRIDGE_NAMESPACE, dir: 'to-content', type: 'save-liked-index', key, index: { bad: true } })).toBeNull();
    expect(parsePageToContent({ ns: BRIDGE_NAMESPACE, dir: 'to-content', type: 'load-liked-index', key: 'spotify:user:abc' })).toBeNull();
    expect(parseContentToPage({ ns: BRIDGE_NAMESPACE, dir: 'to-page', type: 'liked-index', key, index: null })).toEqual({ type: 'liked-index', key, index: null });
  });
});

describe('library writes', () => {
  const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pathfinder/applyCurations.uncurate-liked-track.json');
  const curationFixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    request: { variables: { input: { curations: { contextUri: string }[]; itemUris: string[] } } };
    response: { json: { data: unknown } };
  };
  it('builds applyCurations variables exactly like the player', () => {
    const { request } = curationFixture;
    const curation = request.variables.input.curations[0]!;
    expect(curationVariables(request.variables.input.itemUris, [{ contextUri: curation.contextUri, curationType: 'UNCURATE' }])).toEqual(request.variables);
    expect(parseLibraryChange('applyCurations', curationVariables([`spotify:track:${TRACK(1)}`], [{ contextUri: 'spotify:collection:tracks', curationType: 'UNCURATE' }]))).toEqual({
      kind: 'removed',
      trackIds: [TRACK(1)],
    });
  });

  it('accepts the applyCurations response', () => {
    expect(parseCurationResult(curationFixture.response.json.data)).toBe(true);
    expect(parseCurationResult({ applyCurations: [] })).toBe(false);
    expect(parseCurationResult(null)).toBe(false);
  });

  it('parses editable playlists, liked songs first', () => {
    const page = parseEditablePlaylists({
      me: {
        editablePlaylists: {
          totalCount: 3,
          pagingInfo: { offset: 0, limit: 50 },
          items: [
            {
              curates: true,
              pinned: true,
              item: { __typename: 'LibraryPseudoPlaylistResponseWrapper', _uri: 'spotify:collection:tracks', data: { __typename: 'PseudoPlaylist', name: 'Brani che ti piacciono', uri: 'spotify:collection:tracks', image: { sources: [] } } },
            },
            {
              curates: false,
              pinned: false,
              item: {
                __typename: 'PlaylistResponseWrapper',
                _uri: `spotify:playlist:${'P'.repeat(22)}`,
                data: { __typename: 'Playlist', name: 'Road trip', uri: `spotify:playlist:${'P'.repeat(22)}`, images: { items: [{ sources: [{ url: 'https://i/p', width: null, height: null }] }] } },
              },
            },
            { curates: false, pinned: false, item: { __typename: 'NotFound', _uri: 'spotify:folder:x', data: { name: 'Folder' } } },
          ],
        },
      },
    });
    expect(page).toEqual({
      total: 3,
      itemCount: 3,
      playlists: [
        { uri: 'spotify:collection:tracks', name: 'Brani che ti piacciono', imageUrl: null, curates: true, liked: true },
        { uri: `spotify:playlist:${'P'.repeat(22)}`, name: 'Road trip', imageUrl: 'https://i/p', curates: false, liked: false },
      ],
    });
    expect(parseEditablePlaylists({ me: {} })).toBeNull();
  });
});

describe('liked library sync', () => {
  function setup(wanted: () => boolean) {
    const { items } = fakeLibrary(3);
    const query = vi.fn(async (_operation: string, variables: Record<string, unknown>) => {
      const offset = variables['offset'] as number;
      return { status: 200, errors: [], data: libraryData(items.slice(offset, offset + (variables['limit'] as number)), items.length) };
    });
    const client = { waitForSession: async () => true, query, sent: 0 } as unknown as PathfinderClient;
    const saveIndex = vi.fn();
    const library = new LikedLibrary({ client, loadIndex: async () => null, saveIndex, wanted });
    // The player's own profile request, so the library never asks for it.
    library.onCapture({
      kind: 'pathfinder',
      operationName: 'profileAttributes',
      status: 200,
      json: { data: { me: { profile: { uri: 'spotify:user:someone' } } } },
    } as unknown as CapturedRequest);
    return { library, query, saveIndex };
  }

  it('sends nothing once the features that need the index are off', async () => {
    const { library, query, saveIndex } = setup(() => false);
    await library.ensureFresh();
    expect(query).not.toHaveBeenCalled();
    expect(saveIndex).not.toHaveBeenCalled();
    expect(library.index).toBeNull();
  });

  it('builds the index while a feature needs it', async () => {
    const { library, query, saveIndex } = setup(() => true);
    await library.ensureFresh();
    expect(query).toHaveBeenCalledTimes(1);
    expect(saveIndex).toHaveBeenCalledTimes(1);
    expect(library.index?.tracks).toHaveLength(3);
  });
});
