import { describe, expect, it } from 'vitest';
import { parsePathfinderRequest } from '../../src/page/adapters/pathfinderRequest';

const base = 'https://api-partner.spotify.com/pathfinder/v1/query';

describe('parsePathfinderRequest', () => {
  it('reads GET query string fields', () => {
    const url = new URL(base);
    url.searchParams.set('operationName', 'opName');
    url.searchParams.set('variables', JSON.stringify({ offset: 0 }));
    url.searchParams.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: 'h' } }));
    expect(parsePathfinderRequest(url, null)).toEqual({ operationName: 'opName', hash: 'h', variables: { offset: 0 } });
  });

  it('reads POST body fields', () => {
    const body = JSON.stringify({ operationName: 'op', variables: {}, extensions: { persistedQuery: { sha256Hash: 'x' } } });
    expect(parsePathfinderRequest(new URL(base), body)).toEqual({ operationName: 'op', hash: 'x', variables: {} });
  });

  it('tolerates malformed input', () => {
    const url = new URL(`${base}?operationName=a&variables=%7Bbroken&extensions=nope`);
    expect(parsePathfinderRequest(url, 'not json')).toEqual({ operationName: 'a', hash: null, variables: undefined });
    expect(parsePathfinderRequest(new URL(base), null)).toEqual({ operationName: null, hash: null, variables: undefined });
  });
});
