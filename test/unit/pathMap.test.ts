import { describe, expect, it } from 'vitest';
import { buildPathMap, maskKey } from '../../src/page/debug/pathMap';
import { describeEndpoint } from '../../src/page/debug/requestLog';

describe('buildPathMap', () => {
  const sample = {
    data: {
      album: {
        name: 'secret title',
        tracks: {
          totalCount: 2,
          items: [
            { track: { uri: 'x', playcount: '10', artists: { items: [{ uri: 'y' }] } } },
            { track: { uri: 'z', playcount: null, artists: { items: [] } } },
          ],
        },
      },
    },
  };

  it('lists paths with merged leaf types and no values', () => {
    const { entries, truncated } = buildPathMap(sample, { highlightKeys: ['playcount'] });
    expect(truncated).toBe(false);
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e.types]));
    expect(byPath['$.data.album.name']).toEqual(['string']);
    expect(byPath['$.data.album.tracks.items[].track.playcount']).toEqual(['null', 'string']);
    expect(byPath['$.data.album.tracks.items[].track.artists.items']).toEqual(['empty-array']);
    expect(JSON.stringify(entries)).not.toContain('secret title');
  });

  it('highlights matching keys case-insensitively', () => {
    const { entries } = buildPathMap(sample, { highlightKeys: ['totalcount', 'artists'] });
    const highlighted = entries.filter((e) => e.highlighted).map((e) => e.path);
    expect(highlighted).toContain('$.data.album.tracks.totalCount');
    expect(highlighted).toContain('$.data.album.tracks.items[].track.artists.items[].uri');
    expect(highlighted).not.toContain('$.data.album.name');
  });

  it('truncates very large structures', () => {
    const wide = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    expect(buildPathMap(wide, { maxEntries: 10 })).toMatchObject({ truncated: true });
  });

  it('masks keys that look like data', () => {
    expect(maskKey('playcount')).toBe('playcount');
    expect(maskKey('4uLU6hMCjMI75M1A2tKUQC')).toBe('<id>');
    expect(maskKey('spotify:track:abc')).toBe('<key>');
    expect(maskKey('some free text')).toBe('<key>');
  });
});

describe('describeEndpoint', () => {
  it('keeps only host, service and version', () => {
    expect(describeEndpoint('https://gew4-spclient.spotify.com/user-profile-view/v3/profile/someone?x=1')).toBe(
      'gew4-spclient.spotify.com/user-profile-view/v3/…',
    );
    expect(describeEndpoint('https://spclient.wg.spotify.com/a')).toBe('spclient.wg.spotify.com/a');
  });
});

describe('highlighting', () => {
  it('matches whole keys only', () => {
    const { entries } = buildPathMap(
      { featuringV2: { name: 'x' }, _uri: 'u', entrypointUri: 'e', playcount: '1' },
      { highlightKeys: ['uri', 'playcount'] },
    );
    const highlighted = entries.filter((e) => e.highlighted).map((e) => e.path);
    expect(highlighted.sort()).toEqual(['$._uri', '$.playcount']);
  });
});
