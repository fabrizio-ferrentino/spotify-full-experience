import { describe, expect, it, vi } from 'vitest';
import { extractHashes, isPlayerBundle } from '../../src/page/adapters/bundleHashes';
import { HashRegistry } from '../../src/page/core/hashRegistry';

const H = (c: string) => c.repeat(64);

describe('extractHashes', () => {
  it('finds the hash following each operation name', () => {
    const source = `x=new a.l("fetchLibraryTracks","query",${JSON.stringify(H('a'))},null);y=new a.l("getAlbum","query","${H('b')}",null)`;
    expect(Object.fromEntries(extractHashes(source, ['fetchLibraryTracks', 'getAlbum', 'missing']))).toEqual({
      fetchLibraryTracks: H('a'),
      getAlbum: H('b'),
    });
  });

  it('matches whole names only and ignores longer hex runs', () => {
    const source = `"getAlbumMerch","${H('c')}";"getAlbum","${H('d')}0"`;
    expect(extractHashes(source, ['getAlbum']).size).toBe(0);
  });

  it('recognises player bundles by their CDN', () => {
    expect(isPlayerBundle('https://open.spotifycdn.com/cdn/build/web-player/web-player.c884aee7.js')).toBe(true);
    expect(isPlayerBundle('https://evil.example/web-player.js')).toBe(false);
    expect(isPlayerBundle('not a url')).toBe(false);
  });
});

describe('HashRegistry', () => {
  it('prefers traffic over bundle over known hashes', async () => {
    const registry = new HashRegistry({ op: H('1') }, async () => [`"op","${H('2')}"`]);
    expect(registry.get('op')).toMatchObject({ hash: H('1'), source: 'known' });
    await registry.scanBundles(['op']);
    expect(registry.get('op')).toMatchObject({ hash: H('2'), source: 'bundle' });
    registry.observe('op', H('3'));
    expect(registry.get('op')).toMatchObject({ hash: H('3'), source: 'traffic' });
  });

  it('skips refused hashes and accepts them again when the player uses them', () => {
    const registry = new HashRegistry({ op: H('1') }, async () => []);
    registry.observe('op', H('3'));
    registry.refuse('op', H('3'));
    expect(registry.get('op')).toMatchObject({ hash: H('1'), source: 'known' });
    registry.refuse('op', H('1'));
    expect(registry.get('op')).toBeNull();
    registry.observe('op', H('3'));
    expect(registry.get('op')).toMatchObject({ hash: H('3') });
  });

  it('scans the bundles only once and ignores invalid hashes', async () => {
    const load = vi.fn(async () => [`"op","${H('2')}"`]);
    const registry = new HashRegistry({ bad: 'nope' }, load);
    await registry.scanBundles(['op']);
    await registry.scanBundles(['op']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(registry.get('bad')).toBeNull();
    registry.observe('op', null);
    registry.observe(null, H('9'));
    expect(registry.describe()).toEqual({ op: `bundle ${'2'.repeat(8)}…` });
  });
});
