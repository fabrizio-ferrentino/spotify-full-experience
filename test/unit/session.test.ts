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

  it('trusts a rejected token again once the player uses it successfully', async () => {
    const session = new Session();
    session.observe(headers('t1'));
    session.markRejected();
    const waiting = session.waitUntilReady(10_000);
    // A failed request of the player with the same token changes nothing.
    session.observe(headers('t1'), Promise.resolve(401));
    await Promise.resolve();
    expect(session.ready).toBe(false);
    session.observe(headers('t1'), Promise.resolve(null));
    await Promise.resolve();
    expect(session.ready).toBe(false);
    session.observe(headers('t1'), Promise.resolve(200));
    await expect(waiting).resolves.toBe(true);
    expect(session.requestHeaders()!['authorization']).toBe('Bearer t1');
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
