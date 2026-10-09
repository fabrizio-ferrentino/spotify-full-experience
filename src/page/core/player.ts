// Player commands through Spotify Connect, only on an explicit user action (CLAUDE.md §2.10).
// Everything comes from the player's own traffic: device, spclient host, license and play
// origin. The session token stays in memory (core/session).
import {
  buildPlayCommand,
  commandUrl,
  parseConnectUrl,
  parsePlayParams,
  type ConnectEndpoint,
  type PlayParams,
} from '../adapters/connectShapes';
import type { Session } from './session';

const MIN_INTERVAL_MS = 500;

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class PlayerCommands {
  private endpoint: ConnectEndpoint | null = null;
  private params: PlayParams = { license: null, playOrigin: null };
  private lastSentAt = 0;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly session: Session,
  ) {}

  /** Called for every spclient request of the player. */
  observe(url: string, body: string | null): void {
    const endpoint = parseConnectUrl(url);
    if (!endpoint) return;
    // A command's "from" device beats the startup registration.
    if (endpoint.fromCommand || !this.endpoint?.fromCommand) this.endpoint = endpoint;
    const params = parsePlayParams(body);
    if (params) this.params = params;
  }

  get ready(): boolean {
    return this.endpoint !== null && this.session.ready;
  }

  /** What is known, without any value (for debug mode). */
  describe(): { device: 'none' | 'registration' | 'command'; session: boolean; license: boolean; playOrigin: boolean } {
    return {
      device: this.endpoint ? (this.endpoint.fromCommand ? 'command' : 'registration') : 'none',
      session: this.session.ready,
      license: this.params.license !== null,
      playOrigin: this.params.playOrigin !== null,
    };
  }

  /** Asks the player to play `trackUri` within `contextUri`. Resolves false on any failure. */
  async play(contextUri: string, trackUri: string): Promise<boolean> {
    const endpoint = this.endpoint;
    const headers = this.session.requestHeaders();
    if (!endpoint || !headers) return false;
    const now = Date.now();
    if (now - this.lastSentAt < MIN_INTERVAL_MS) return false;
    this.lastSentAt = now;
    try {
      const response = await this.fetchFn(commandUrl(endpoint), {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPlayCommand(contextUri, trackUri, this.params, randomHex(16))),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
