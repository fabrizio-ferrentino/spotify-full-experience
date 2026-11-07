// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { findPlayerCuration, type PlayerCuration } from '../../src/page/adapters/playerInternals';
import { LikedLibrary } from '../../src/page/library/likedLibrary';
import type { PathfinderClient } from '../../src/page/core/pathfinderClient';
import type { LikedIndex } from '../../src/shared/likedIndex';

const TRACK = 'T'.repeat(22);
const PLAYLIST = `spotify:playlist:${'P'.repeat(22)}`;
const LIKED = 'spotify:collection:tracks';

/** A <main> whose React fiber chain reaches a context value with the player's registry, as seen live. */
function mainWithRegistry(curationApi: unknown, { symbolKeys = true } = {}): HTMLElement {
  const main = document.createElement('main');
  const map = new Map<unknown, unknown>();
  const key = (name: string) => (symbolKeys ? Symbol(name) : name);
  map.set(key('LibraryAPI'), {});
  const curationKey = key('CurationAPI');
  map.set(curationKey, curationApi);
  const registry = { _map: map, resolve: (k: unknown) => (k === curationKey ? curationApi : map.get(k)) };
  const platform = { version: '1', getRegistry: () => registry };
  const provider = { type: { _context: {} }, memoizedProps: { value: platform }, return: null };
  const other = { type: { _context: {} }, memoizedProps: { value: { filters: [] } }, return: provider };
  const host = { type: 'main', memoizedProps: {}, return: other };
  (main as unknown as Record<string, unknown>)['__reactFiber$abc123'] = host;
  return main;
}

describe('player CurationAPI lookup', () => {
  it('finds curateItems through the registry above <main> and calls it on the API', async () => {
    const api = { calls: [] as unknown[], curateItems(this: { calls: unknown[] }, ...args: unknown[]) { this.calls.push(args); return Promise.resolve('ok'); } };
    const curation = findPlayerCuration(mainWithRegistry(api));
    expect(curation).not.toBeNull();
    await expect(curation!.curateItems(`spotify:track:${TRACK}`, [PLAYLIST], [LIKED])).resolves.toBe('ok');
    expect(api.calls).toEqual([[`spotify:track:${TRACK}`, [PLAYLIST], [LIKED]]]);
  });

  it('returns null when anything does not match', () => {
    expect(findPlayerCuration(null)).toBeNull();
    expect(findPlayerCuration(document.createElement('main'))).toBeNull();
    expect(findPlayerCuration(mainWithRegistry({ curate: () => {} }))).toBeNull();
    expect(findPlayerCuration(mainWithRegistry(null))).toBeNull();
    const throwing = document.createElement('main');
    Object.defineProperty(throwing, '__reactFiber$x', { enumerable: true, get: () => { throw new Error('boom'); } });
    expect(findPlayerCuration(throwing)).toBeNull();
  });
});

describe('library writes through the player', () => {
  // Checked just now: no sync request before the writes.
  const index: LikedIndex = {
    v: 3,
    checkedAt: 1,
    total: 1,
    tracks: [{ t: TRACK, a: 'A'.repeat(22), d: 1, n: 'Song', ar: ['Artist'], ad: ['A'.repeat(22)], al: 'Album', ai: null, c: '', ms: 1000, e: false }],
  };

  async function setup(player: PlayerCuration | null) {
    const query = vi.fn(async () => ({ status: 200, data: { applyCurations: [{ data: { isCurated: false } }] }, errors: [] }));
    const client = { query, waitForSession: async () => true, sent: 0 } as unknown as PathfinderClient;
    const library = new LikedLibrary({
      client,
      loadIndex: async () => index,
      saveIndex: () => {},
      playerCuration: () => player,
      now: () => 2,
    });
    library.onCapture({ kind: 'pathfinder', operationName: 'profileAttributes', status: 200, json: { data: { me: { profile: { uri: 'spotify:user:test' } } } } } as never);
    await library.ensureFresh();
    expect(query).not.toHaveBeenCalled();
    return { library, query };
  }

  it('uses the player API, so its ticks follow, and applies the change to the index', async () => {
    const curateItems = vi.fn(async () => undefined);
    const { library, query } = await setup({ curateItems });
    expect(library.isLiked(TRACK)).toBe(true);
    await expect(library.curate(TRACK, [{ contextUri: LIKED, curationType: 'UNCURATE' }, { contextUri: PLAYLIST, curationType: 'CURATE' }])).resolves.toBe(true);
    expect(curateItems).toHaveBeenCalledWith(`spotify:track:${TRACK}`, [PLAYLIST], [LIKED]);
    expect(query).not.toHaveBeenCalled();
    expect(library.isLiked(TRACK)).toBe(false);
  });

  it('falls back to its own request when the player API fails or is missing, and says so', async () => {
    const failing = await setup({ curateItems: vi.fn(async () => Promise.reject(new Error('changed'))) });
    await expect(failing.library.curate(TRACK, [{ contextUri: LIKED, curationType: 'UNCURATE' }])).resolves.toBe('unsynced');
    expect(failing.query).toHaveBeenCalledWith('applyCurations', { input: { curations: [{ contextUri: LIKED, curationType: 'UNCURATE' }], itemUris: [`spotify:track:${TRACK}`] } });
    expect(failing.library.isLiked(TRACK)).toBe(false);

    const missing = await setup(null);
    await expect(missing.library.curate(TRACK, [{ contextUri: PLAYLIST, curationType: 'CURATE' }])).resolves.toBe('unsynced');
    expect(missing.query).toHaveBeenCalledTimes(1);
  });

  it('fails when both ways fail', async () => {
    const { library, query } = await setup(null);
    query.mockResolvedValueOnce({ status: 200, data: null, errors: ['nope'] } as never);
    await expect(library.curate(TRACK, [{ contextUri: LIKED, curationType: 'UNCURATE' }])).resolves.toBe(false);
    expect(library.isLiked(TRACK)).toBe(true);
  });
});
