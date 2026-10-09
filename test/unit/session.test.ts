import { describe, expect, it, vi } from 'vitest';
import { Session } from '../../src/page/core/session';

const headers = (token: string | null, extra: Record<string, string> = {}) =>
  new Headers({ ...(token ? { authorization: `Bearer ${token}` } : {}), 'client-token': 'ct', 'spotify-app-version': '1.2.3', cookie: 'x', ...extra });

describe('Session', () => {
  it('keeps only the allowlisted session headers', () => {
    const session = new Session();
    session.observe(headers('t1', { 'x-other': 'no' }));
    expect(session.ready).toBe(true);
    expect(session.appVersion).toBe('1.2.3');
    expect(session.headerNames).toEqual(['authorization', 'client-token', 'spotify-app-version']);
    const out = session.requestHeaders()!;
    expect(out['authorization']).toBe('Bearer t1');
    expect(out['cookie']).toBeUndefined();
    expect(out['x-other']).toBeUndefined();
    expect(out['content-type']).toContain('application/json');
  });

  it('ignores requests without a token', () => {
    const session = new Session();
    session.observe(headers(null));
    expect(session.ready).toBe(false);
    expect(session.requestHeaders()).toBeNull();
  });

  it('after a rejection waits for the player to use a new token', async () => {
    vi.useFakeTimers();
    const session = new Session();
    session.observe(headers('t1'));
    session.markRejected();
    expect(session.ready).toBe(false);
    const waiting = session.waitUntilReady(10_000);
    session.observe(headers('t1')); // same token: still rejected
    expect(session.ready).toBe(false);
    session.observe(headers('t2'));
    await expect(waiting).resolves.toBe(true);
    expect(session.requestHeaders()!['authorization']).toBe('Bearer t2');
    vi.useRealTimers();
  });

  it('gives up waiting after the timeout', async () => {
    vi.useFakeTimers();
    const session = new Session();
    const waiting = session.waitUntilReady(1000);
    vi.advanceTimersByTime(1000);
    await expect(waiting).resolves.toBe(false);
    vi.useRealTimers();
  });
});
