// Our own Pathfinder queries: only a fallback when the player's responses are not enough
// (CLAUDE.md §2.5). One query at a time with a minimum interval, identical queries shared,
// exponential backoff on 429, wait for the player's next token on 401/403, and one retry
// with another hash source when the persisted query is unknown.
import { PATHFINDER_V2_URL } from '../adapters/endpoints';
import type { HashRegistry } from './hashRegistry';
import type { Session } from './session';

export interface QueryResult {
  status: number;
  /** GraphQL `data`, or null. */
  data: unknown;
  errors: string[];
}

export class PathfinderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  minIntervalMs?: number;
  maxRateLimitRetries?: number;
  /** How long to wait for the player to refresh its token after a 401/403. */
  tokenWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const PERSISTED_QUERY_NOT_FOUND = /PersistedQueryNotFound/i;

export class PathfinderClient {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inFlight = new Map<string, Promise<QueryResult>>();
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private readonly minIntervalMs: number;
  private readonly maxRateLimitRetries: number;
  private readonly tokenWaitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  /** Number of requests actually sent (for debug mode and tests). */
  sent = 0;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly session: Session,
    private readonly registry: HashRegistry,
    options: ClientOptions = {},
  ) {
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.maxRateLimitRetries = options.maxRateLimitRetries ?? 4;
    this.tokenWaitMs = options.tokenWaitMs ?? 60_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  /** Runs a query; identical concurrent queries share one request. Throws PathfinderError. */
  query(operationName: string, variables: Record<string, unknown>): Promise<QueryResult> {
    const key = JSON.stringify([operationName, variables]);
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const run = this.queue.then(() => this.execute(operationName, variables));
    this.queue = run.catch(() => {});
    const shared = run.finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, shared);
    return shared;
  }

  private async execute(operationName: string, variables: Record<string, unknown>): Promise<QueryResult> {
    let entry = this.registry.get(operationName);
    if (!entry) {
      await this.registry.scanBundles([operationName]);
      entry = this.registry.get(operationName);
    }
    if (!entry) throw new PathfinderError(`no hash for ${operationName}`);

    let rateLimited = 0;
    let tokenRetried = false;
    let hashRetried = false;
    for (;;) {
      if (!this.session.ready && !(await this.session.waitUntilReady(this.tokenWaitMs))) {
        throw new PathfinderError('no usable session token');
      }
      const response = await this.send(operationName, entry.hash, variables);

      if (response.status === 429 && rateLimited < this.maxRateLimitRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.minIntervalMs * 2 ** (rateLimited + 1);
        rateLimited += 1;
        await this.sleep(backoff);
        continue;
      }
      if ((response.status === 401 || response.status === 403) && !tokenRetried) {
        tokenRetried = true;
        this.session.markRejected();
        continue; // waits for the player's next token at the top of the loop
      }
      if (!response.ok) throw new PathfinderError(`${operationName} failed`, response.status);

      const body = (await response.json().catch(() => null)) as { data?: unknown; errors?: { message?: unknown }[] } | null;
      const errors = (body?.errors ?? []).map((error) => String(error?.message ?? 'unknown error'));
      if (errors.some((message) => PERSISTED_QUERY_NOT_FOUND.test(message)) && !hashRetried) {
        hashRetried = true;
        this.registry.refuse(operationName, entry.hash);
        await this.registry.scanBundles([operationName]);
        const next = this.registry.get(operationName);
        if (!next) throw new PathfinderError(`${operationName}: persisted query not found`, response.status);
        entry = next;
        continue;
      }
      return { status: response.status, data: body?.data ?? null, errors };
    }
  }

  private async send(operationName: string, hash: string, variables: Record<string, unknown>): Promise<Response> {
    const wait = this.lastRequestAt + this.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    const headers = this.session.requestHeaders();
    if (!headers) throw new PathfinderError('no usable session token');
    this.lastRequestAt = this.now();
    this.sent += 1;
    try {
      return await this.fetchFn(PATHFINDER_V2_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          variables,
          operationName,
          extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
        }),
      });
    } catch {
      throw new PathfinderError(`${operationName}: network error`);
    }
  }
}
