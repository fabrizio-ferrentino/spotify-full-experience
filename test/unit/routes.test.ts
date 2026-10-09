import { describe, expect, it } from 'vitest';
import { parseRoute } from '../../src/page/adapters/routes';

describe('parseRoute', () => {
  it('parses entity pages', () => {
    expect(parseRoute('/album/abc123')).toEqual({ kind: 'album', id: 'abc123' });
    expect(parseRoute('/artist/abc123/discography/all')).toEqual({ kind: 'artist', id: 'abc123' });
    expect(parseRoute('/track/abc123')).toEqual({ kind: 'track', id: 'abc123' });
    expect(parseRoute('/playlist/abc123/')).toEqual({ kind: 'playlist', id: 'abc123' });
  });

  it('accepts the localized prefix', () => {
    expect(parseRoute('/intl-it/album/abc123')).toEqual({ kind: 'album', id: 'abc123' });
    expect(parseRoute('/intl-pt-br/track/abc123')).toEqual({ kind: 'track', id: 'abc123' });
  });

  it('parses collection pages', () => {
    expect(parseRoute('/collection/tracks')).toEqual({ kind: 'collection', id: 'tracks' });
  });

  it('falls back to other', () => {
    for (const path of ['/', '/search', '/search/foo', '/user/someone', '/albumx/abc', '/album/']) {
      expect(parseRoute(path)).toEqual({ kind: 'other', id: null });
    }
  });
});
