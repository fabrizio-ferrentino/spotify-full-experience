// Our spclient requests, only on an explicit user action (CLAUDE.md §2.10): same host, headers
// and bodies as the player's own. Spaced out, never retried; the token stays in memory
// (core/session).
import type { Session } from './session';

const MIN_INTERVAL_MS = 300;

export class SpclientRequests {
  private lastSentAt = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly session: Session,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** JSON response of a GET, or null on any failure. */
  get(url: string): Promise<unknown> {
    return this.send(url, { method: 'GET' });
  }

  /** JSON response of a POST with a JSON body, or null on any failure (an empty body is `{}`). */
  post(url: string, body: unknown): Promise<unknown> {
    return this.send(url, { method: 'POST', body: JSON.stringify(body) });
  }

  /** Protobuf response of a POST with a JSON body (like the player's extended metadata), or null. */
  postForProtobuf(url: string, body: unknown): Promise<Uint8Array | null> {
    return this.send(url, { method: 'POST', body: JSON.stringify(body) }, 'application/protobuf') as Promise<Uint8Array | null>;
  }

  private send(url: string, init: RequestInit, accept?: string): Promise<unknown> {
    const run = this.queue.then(async () => {
      const session = this.session.requestHeaders();
      if (!session) return null;
      const headers = accept ? { ...session, accept } : session;
      const wait = this.lastSentAt + MIN_INTERVAL_MS - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastSentAt = this.now();
      try {
        const response = await this.fetchFn(url, { ...init, headers });
        if (!response.ok) return null;
        if (accept) return new Uint8Array(await response.arrayBuffer());
        const text = await response.text();
        return text ? (JSON.parse(text) as unknown) : {};
      } catch {
        return null;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
