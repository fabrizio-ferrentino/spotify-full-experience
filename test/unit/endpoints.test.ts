import { describe, expect, it } from 'vitest';
import { matchEndpoint } from '../../src/page/adapters/endpoints';

describe('matchEndpoint', () => {
  it('matches Pathfinder v1 and v2 with their version', () => {
    expect(matchEndpoint('https://api-partner.spotify.com/pathfinder/v1/query?operationName=x')).toEqual({
      kind: 'pathfinder',
      pathfinderVersion: 1,
    });
    expect(matchEndpoint('https://api-partner.spotify.com/pathfinder/v2/query')).toEqual({
      kind: 'pathfinder',
      pathfinderVersion: 2,
    });
  });

  it('matches spclient hosts', () => {
    for (const host of ['spclient.wg.spotify.com', 'gew4-spclient.spotify.com', 'spclient.spotify.com']) {
      expect(matchEndpoint(`https://${host}/color-lyrics/v2/track/x`)).toEqual({
        kind: 'spclient',
        pathfinderVersion: null,
      });
    }
  });

  it('ignores unrelated or lookalike URLs', () => {
    for (const url of [
      'https://open.spotify.com/album/x',
      'https://api.spotify.com/v1/albums/x',
      'https://api-partner.spotify.com/pathfinder/v1/other',
      'http://api-partner.spotify.com/pathfinder/v1/query',
      'https://notspclient.spotify.com/x',
      'https://spclient.spotify.com.evil.example/x',
      'not a url',
    ]) {
      expect(matchEndpoint(url)).toBeNull();
    }
  });

  it('resolves relative URLs against a base', () => {
    expect(matchEndpoint('/pathfinder/v2/query', 'https://api-partner.spotify.com')).not.toBeNull();
  });
});
