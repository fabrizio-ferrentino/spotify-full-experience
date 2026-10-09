import { describe, expect, it } from 'vitest';
import { anonymize, anonymizeString, REDACTED } from '../../src/shared/anonymize';
import { findSensitivePatterns } from '../../src/shared/fixtureSafety';
import { exportFixture } from '../../src/page/debug/fixture';
import type { CapturedRequest } from '../../src/page/core/interceptor';

// Synthetic values only: nothing here comes from real traffic.
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlLXVzZXIifQ.c2lnbmF0dXJlLWZha2U';

describe('anonymizeString', () => {
  it('redacts credentials and personal identifiers', () => {
    expect(anonymizeString('Bearer abc.def')).toBe('<bearer>');
    expect(anonymizeString(FAKE_JWT)).toBe('<jwt>');
    expect(anonymizeString('a=1; sp_dc=xyz; b=2')).toBe('a=1; <cookie>; b=2');
    expect(anonymizeString('spotify:user:fakeuser123:collection')).toBe('<user-uri>:collection');
    expect(anonymizeString('https://open.spotify.com/user/fakeuser?si=1')).toBe(`https://open.spotify.com/user/${REDACTED}?si=${REDACTED}`);
    expect(anonymizeString('write to someone@example.com')).toBe('write to <email>');
    expect(anonymizeString('A'.repeat(120))).toBe('<opaque>');
    expect(anonymizeString('https://open.spotify.com/album/abc?si=Xy_z-123&nd=1')).toBe(
      `https://open.spotify.com/album/abc?si=${REDACTED}&nd=1`,
    );
  });

  it('drops per-interaction ids', () => {
    expect(anonymize({ interactionId: 'eefe63d6-99c9-43b3-9fa7-3603c94f66d6' })).toEqual({ interactionId: REDACTED });
    expect(anonymize({ sharingInfo: { shareId: 'abc' }, revisionId: 'xyz' })).toEqual({
      sharingInfo: { shareId: REDACTED },
      revisionId: REDACTED,
    });
  });

  it('keeps catalog data', () => {
    for (const value of ['spotify:track:4uLU6hMCjMI75M1A2tKUQC', 'https://i.scdn.co/image/ab67616d0000b273', '2441116']) {
      expect(anonymizeString(value)).toBe(value);
    }
  });
});

describe('anonymize', () => {
  it('redacts user objects entirely but keeps their schema keys and numbers', () => {
    const owner = { __typename: 'User', name: 'Fake Person', uri: 'spotify:user:fake', avatar: { sources: [{ url: 'https://x/a.jpg', width: 64 }] } };
    expect(anonymize({ playlist: { name: 'Mix', owner } })).toEqual({
      playlist: {
        name: 'Mix',
        owner: { __typename: 'User', name: REDACTED, uri: REDACTED, avatar: { sources: [{ url: REDACTED, width: 64 }] } },
      },
    });
  });

  it('redacts deny-listed keys and anonymizes object keys', () => {
    expect(anonymize({ Username: 'x', email: 'a@b.co', 'spotify:user:abc': { n: 1 } })).toEqual({
      Username: REDACTED,
      email: REDACTED,
      '<user-uri>': { n: 1 },
    });
  });

  it('produces output that passes the safety scan', () => {
    const dirty = {
      headers: { authorization: 'Bearer zzz' },
      cookie: 'sp_dc=abc; sp_key=def',
      uri: 'spotify:user:abc:collection:artist:xyz',
      link: 'https://open.spotify.com/user/abc',
      contact: 'x@y.com',
      token: FAKE_JWT,
      share: 'https://open.spotify.com/track/x?si=abcdef',
    };
    expect(findSensitivePatterns(JSON.stringify(dirty)).length).toBeGreaterThan(0);
    expect(findSensitivePatterns(JSON.stringify(anonymize(dirty)))).toEqual([]);
  });
});

describe('exportFixture', () => {
  const capture: CapturedRequest = {
    id: 1,
    transport: 'fetch',
    kind: 'pathfinder',
    method: 'GET',
    url: 'https://api-partner.spotify.com/pathfinder/v1/query?operationName=fakeOp&variables=%7B%7D',
    pathfinderVersion: 1,
    operationName: 'fakeOp',
    hash: 'deadbeef',
    variables: { uri: 'spotify:user:abc:collection' },
    requestHeaderNames: ['authorization'],
    status: 200,
    responseHeaderNames: ['content-type'],
    contentType: 'application/json',
    json: { data: { me: { __typename: 'User', username: 'abc' } } },
    durationMs: 5,
  };

  it('exports an anonymized fixture without the query string', () => {
    const result = exportFixture(capture, new Date('2026-10-09T12:00:00Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe('fakeOp.2026-10-09.json');
    const fixture = JSON.parse(result.text);
    expect(fixture.request.endpoint).toBe('api-partner.spotify.com/pathfinder/v1/query');
    expect(fixture.request.variables).toEqual({ uri: '<user-uri>:collection' });
    expect(fixture.response.json).toEqual({ data: { me: { __typename: 'User', username: REDACTED } } });
  });
});
