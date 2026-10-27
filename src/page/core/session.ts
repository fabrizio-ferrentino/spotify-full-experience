// Session headers of the web player, copied from its own Pathfinder requests.
// Kept in memory only (CLAUDE.md §2.3): never logged, never stored, never put on the bridge,
// never exposed by debug tools (only header names and the app version are).
import { APP_VERSION_HEADER, AUTHORIZATION_HEADER, SESSION_HEADER_NAMES } from '../adapters/sessionHeaders';

export class Session {
  private values = new Map<string, string>();
  /** Token our own query got a 401/403 for: unusable until the player shows it is still valid. */
  private rejectedToken: string | null = null;
  private waiters = new Set<() => void>();

  /**
   * Called for every Pathfinder request of the player, with the status of its response.
   * A success with the token we had rejected means the refusal was about our query, not the
   * token (a 403 can be), so the token is usable again.
   */
  observe(headers: Headers, status?: Promise<number | null>): void {
    const previous = this.values.get(AUTHORIZATION_HEADER);
    const next = new Map<string, string>();
    for (const name of SESSION_HEADER_NAMES) {
      const value = headers.get(name);
      if (value) next.set(name, value);
    }
    const token = next.get(AUTHORIZATION_HEADER);
    if (token === undefined) return;
    this.values = next;
    if (token !== previous) this.wakeIfReady();
    void status?.then((code) => {
      if (code === null || code < 200 || code >= 300 || token !== this.rejectedToken) return;
      this.rejectedToken = null;
      this.wakeIfReady();
    });
  }

  get ready(): boolean {
    const token = this.values.get(AUTHORIZATION_HEADER);
    return token !== undefined && token !== this.rejectedToken;
  }

  get appVersion(): string | null {
    return this.values.get(APP_VERSION_HEADER) ?? null;
  }

  /** Header names currently held (safe to show in debug mode). */
  get headerNames(): string[] {
    return [...this.values.keys()].sort();
  }

  /** Headers for one of our queries, or null when there is no usable token. */
  requestHeaders(): Record<string, string> | null {
    if (!this.ready) return null;
    return {
      ...Object.fromEntries(this.values),
      accept: 'application/json',
      'content-type': 'application/json;charset=UTF-8',
    };
  }

  /** The current token was refused: wait for the player to use a new one, or this one successfully. */
  markRejected(): void {
    this.rejectedToken = this.values.get(AUTHORIZATION_HEADER) ?? null;
  }

  /** Resolves true when a usable token is available, false after `timeoutMs`. */
  waitUntilReady(timeoutMs: number): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(wake);
        resolve(false);
      }, timeoutMs);
      this.waiters.add(wake);
    });
  }

  private wakeIfReady(): void {
    if (!this.ready) return;
    for (const wake of this.waiters) wake();
    this.waiters.clear();
  }
}
