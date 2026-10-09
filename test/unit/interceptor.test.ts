import { describe, expect, it, vi } from 'vitest';
import { installFetchInterceptor, type CapturedRequest } from '../../src/page/core/interceptor';

const PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v2/query';

function setup(response: () => Response, shouldCapture = true) {
  const original = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  const target = { fetch: original as unknown as typeof fetch };
  const captures: CapturedRequest[] = [];
  installFetchInterceptor(target, { shouldCapture: () => shouldCapture, onCapture: (c) => captures.push(c) });
  return { target, original, captures };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('fetch interceptor', () => {
  it('returns the original response untouched and still readable', async () => {
    const original = jsonResponse({ data: { a: 1 } });
    const { target, captures } = setup(() => original);
    const response = await target.fetch(PATHFINDER, { method: 'POST', body: '{}' });
    expect(response).toBe(original);
    expect(await response.json()).toEqual({ data: { a: 1 } });
    await flush();
    expect(captures).toHaveLength(1);
  });

  it('captures POST persisted-query fields, header names and parsed JSON', async () => {
    const { target, captures } = setup(() => jsonResponse({ data: { x: [1] } }));
    await target.fetch(PATHFINDER, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'App-Platform': 'WebPlayer' },
      body: JSON.stringify({
        operationName: 'someOperation',
        variables: { uri: 'spotify:album:x', limit: 50 },
        extensions: { persistedQuery: { version: 1, sha256Hash: 'abc123' } },
      }),
    });
    await flush();
    const [capture] = captures;
    expect(capture).toMatchObject({
      transport: 'fetch',
      kind: 'pathfinder',
      method: 'POST',
      pathfinderVersion: 2,
      operationName: 'someOperation',
      hash: 'abc123',
      variables: { uri: 'spotify:album:x', limit: 50 },
      requestHeaderNames: ['app-platform', 'authorization'],
      status: 200,
      json: { data: { x: [1] } },
    });
    expect(JSON.stringify(capture)).not.toContain('secret-token');
  });

  it('reads the body of a Request object without consuming it for the caller', async () => {
    let seenBody: string | null = null;
    const original = vi.fn(async (input: RequestInfo | URL) => {
      seenBody = await (input as Request).text();
      return jsonResponse({});
    });
    const target = { fetch: original as unknown as typeof fetch };
    const captures: CapturedRequest[] = [];
    installFetchInterceptor(target, { shouldCapture: () => true, onCapture: (c) => captures.push(c) });

    const body = JSON.stringify({ operationName: 'fromRequest' });
    await target.fetch(new Request(PATHFINDER, { method: 'POST', body }));
    await flush();
    expect(seenBody).toBe(body);
    expect(captures[0]?.operationName).toBe('fromRequest');
  });

  it('does not capture unrelated URLs or when capture is off', async () => {
    const unrelated = setup(() => jsonResponse({}));
    await unrelated.target.fetch('https://open.spotify.com/album/x');
    const off = setup(() => jsonResponse({}), false);
    await off.target.fetch(PATHFINDER);
    await flush();
    expect(unrelated.captures).toHaveLength(0);
    expect(off.captures).toHaveLength(0);
  });

  it('propagates network errors unchanged', async () => {
    const error = new TypeError('network down');
    const original = vi.fn(async () => {
      throw error;
    });
    const target = { fetch: original as unknown as typeof fetch };
    installFetchInterceptor(target, { shouldCapture: () => true, onCapture: () => {} });
    await expect(target.fetch(PATHFINDER)).rejects.toBe(error);
  });

  it('survives a throwing consumer', async () => {
    const original = jsonResponse({});
    const target = { fetch: (async () => original) as unknown as typeof fetch };
    installFetchInterceptor(target, {
      shouldCapture: () => true,
      onCapture: () => {
        throw new Error('consumer bug');
      },
    });
    expect(await target.fetch(PATHFINDER)).toBe(original);
    await flush();
  });

  it('records non-JSON responses without reading their body', async () => {
    const { target, captures } = setup(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/protobuf' } }),
    );
    const response = await target.fetch('https://gew4-spclient.spotify.com/some-service/v1/x');
    expect((await response.arrayBuffer()).byteLength).toBe(3);
    await flush();
    expect(captures[0]).toMatchObject({ kind: 'spclient', json: undefined, contentType: 'application/protobuf' });
  });
});
