import { describe, expect, it, vi } from 'vitest';
import { HashRegistry } from '../../src/page/core/hashRegistry';
import { PathfinderClient, PathfinderError } from '../../src/page/core/pathfinderClient';
import { Session } from '../../src/page/core/session';

const H = (c: string) => c.repeat(64);
const ok = (data: unknown, errors?: unknown[]) =>
  new Response(JSON.stringify({ data, ...(errors ? { errors } : {}) }), { status: 200, headers: { 'content-type': 'application/json' } });

function setup(responses: (Response | (() => Response))[], options: { token?: string } = {}) {
  const session = new Session();
  session.observe(new Headers({ authorization: `Bearer ${options.token ?? 't1'}` }));
  const registry = new HashRegistry({ op: H('1') }, async () => [`"op","${H('2')}"`]);
  const calls: { url: string; body: { operationName: string; variables: unknown; extensions: { persistedQuery: { sha256Hash: string } } }; auth: string }[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: headers['authorization']! });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return typeof next === 'function' ? next() : next;
  });
  let clock = 0;
  const sleeps: number[] = [];
  const client = new PathfinderClient(fetchFn as unknown as typeof fetch, session, registry, {
    minIntervalMs: 1000,
    tokenWaitMs: 5000,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { client, session, registry, calls, sleeps, fetchFn };
}

describe('PathfinderClient', () => {
  it('sends a persisted query with the session headers', async () => {
    const { client, calls } = setup([ok({ a: 1 })]);
    await expect(client.query('op', { offset: 0 })).resolves.toEqual({ status: 200, data: { a: 1 }, errors: [] });
    expect(calls[0]).toMatchObject({
      url: 'https://api-partner.spotify.com/pathfinder/v2/query',
      auth: 'Bearer t1',
      body: { operationName: 'op', variables: { offset: 0 }, extensions: { persistedQuery: { sha256Hash: H('1') } } },
    });
  });

  it('runs one query at a time with a minimum interval and shares identical queries', async () => {
    const { client, calls, sleeps } = setup([ok(1), ok(2)]);
    const [a, b, c] = await Promise.all([
      client.query('op', { offset: 0 }),
      client.query('op', { offset: 0 }),
      client.query('op', { offset: 1 }),
    ]);
    expect(a).toBe(b);
    expect(c.data).toBe(2);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it('backs off exponentially on 429, honouring Retry-After', async () => {
    const { client, sleeps } = setup([
      new Response('', { status: 429 }),
      new Response('', { status: 429, headers: { 'retry-after': '7' } }),
      ok('done'),
    ]);
    await expect(client.query('op', {})).resolves.toMatchObject({ data: 'done' });
    expect(sleeps).toEqual([2000, 7000]);
  });

  it('gives up at once when Retry-After asks for more than a minute', async () => {
    const { client, calls } = setup([new Response('', { status: 429, headers: { 'retry-after': '3600' } })]);
    await expect(client.query('op', {})).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(1);
  });

  it('gives up after too many 429', async () => {
    const { client } = setup(Array.from({ length: 5 }, () => () => new Response('', { status: 429 })));
    await expect(client.query('op', {})).rejects.toMatchObject({ status: 429 });
  });

  it('on 401 waits for the player to use a new token, then retries once', async () => {
    const { client, session, calls } = setup([new Response('', { status: 401 }), ok('fresh')]);
    const pending = client.query('op', {});
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await Promise.resolve();
    expect(session.ready).toBe(false);
    session.observe(new Headers({ authorization: 'Bearer t2' }));
    await expect(pending).resolves.toMatchObject({ data: 'fresh' });
    expect(calls[1]!.auth).toBe('Bearer t2');
  });

  it('on 403 retries with the same token once the player uses it successfully', async () => {
    const { client, session, calls } = setup([new Response('', { status: 403 }), ok('fine')]);
    const pending = client.query('op', {});
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await Promise.resolve();
    expect(session.ready).toBe(false);
    session.observe(new Headers({ authorization: 'Bearer t1' }), Promise.resolve(200));
    await expect(pending).resolves.toMatchObject({ data: 'fine' });
    expect(calls[1]!.auth).toBe('Bearer t1');
  });

  it('retries once with another hash source when the persisted query is unknown', async () => {
    const { client, calls, registry } = setup([ok(null, [{ message: 'PersistedQueryNotFound' }]), ok('ok')]);
    await expect(client.query('op', {})).resolves.toMatchObject({ data: 'ok' });
    expect(calls.map((c) => c.body.extensions.persistedQuery.sha256Hash)).toEqual([H('1'), H('2')]);
    expect(registry.get('op')?.source).toBe('bundle');
  });

  it('retries once with another hash source on HTTP 412 "Invalid query hash", as Spotify answers', async () => {
    const invalid = () => new Response('"Invalid query hash"', { status: 412, headers: { 'content-type': 'application/json' } });
    const { client, calls, registry } = setup([invalid(), ok('ok')]);
    await expect(client.query('op', {})).resolves.toMatchObject({ data: 'ok' });
    expect(calls.map((c) => c.body.extensions.persistedQuery.sha256Hash)).toEqual([H('1'), H('2')]);
    expect(registry.get('op')?.source).toBe('bundle');

    // No other hash, or the other one refused too: the query fails.
    const twice = setup([invalid(), invalid()]);
    await expect(twice.client.query('op', {})).rejects.toMatchObject({ status: 412 });
    expect(twice.calls).toHaveLength(2);
  });

  it('fails cleanly without a hash, a token or on other HTTP errors', async () => {
    const noHash = setup([]);
    await expect(noHash.client.query('unknownOp', {})).rejects.toBeInstanceOf(PathfinderError);
    const serverError = setup([new Response('', { status: 500 })]);
    await expect(serverError.client.query('op', {})).rejects.toMatchObject({ status: 500 });
  });
});
