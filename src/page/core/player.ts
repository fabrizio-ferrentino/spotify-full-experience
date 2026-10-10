// Player commands through Spotify Connect, only on an explicit user action (CLAUDE.md §2.10).
// Everything comes from the player's own traffic: device, spclient host, license and play
// origin. The session token stays in memory (core/session).
import {
  buildPlayCommand,
  buildQueueCommand,
  clusterUrl,
  commandUrl,
  parseActiveDevice,
  parseConnectUrl,
  parsePlayParams,
  parseQueueTemplate,
  type ConnectEndpoint,
  type PlayParams,
  type QueueTemplate,
} from '../adapters/connectShapes';
import type { Session } from './session';

const MIN_INTERVAL_MS = 500;

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class PlayerCommands {
  private endpoint: ConnectEndpoint | null = null;
  private params: PlayParams = { license: null, playOrigin: null };
  private queueTemplate: QueueTemplate | null = null;
  private lastSentAt = 0;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly session: Session,
  ) {}

  /** Called for every spclient request of the player. */
  observe(url: string, body: string | null): void {
    const endpoint = parseConnectUrl(url);
    if (!endpoint) return;
    // A command's "from" device beats the one seen on playback requests.
    if (endpoint.fromCommand || !this.endpoint?.fromCommand) this.endpoint = endpoint;
    const params = parsePlayParams(body);
    if (params) this.params = params;
    const template = parseQueueTemplate(body);
    if (template) this.queueTemplate = template;
  }

  get ready(): boolean {
    return this.endpoint !== null && this.session.ready;
  }

  /** What is known, without any value (for debug mode). */
  describe(): { device: 'none' | 'playback' | 'command'; session: boolean; license: boolean; playOrigin: boolean } {
    return {
      device: this.endpoint ? (this.endpoint.fromCommand ? 'command' : 'playback') : 'none',
      session: this.session.ready,
      license: this.params.license !== null,
      playOrigin: this.params.playOrigin !== null,
    };
  }

  /** Asks the player to play `trackUri` within `contextUri`. Resolves false on any failure. */
  play(contextUri: string, trackUri: string): Promise<boolean> {
    return this.send(() => buildPlayCommand(contextUri, trackUri, this.params, randomHex(16)));
  }

  /**
   * Adds `trackUri` to the queue of the device that is playing (this tab or another one), like
   * the player: it reads the Connect state first. Resolves false when nothing is playing or on
   * any failure.
   */
  async queue(trackUri: string): Promise<boolean> {
    const endpoint = this.endpoint;
    const headers = this.session.requestHeaders();
    if (!endpoint || !headers || !this.claimSlot()) return false;
    try {
      const response = await this.fetchFn(clusterUrl(endpoint), { method: 'GET', headers });
      const target = response.ok ? parseActiveDevice(await response.json()) : null;
      if (!target) return false;
      return await this.post(endpoint, target, headers, buildQueueCommand(trackUri, this.queueTemplate, randomHex(16)));
    } catch {
      return false;
    }
  }

  private async send(body: () => unknown): Promise<boolean> {
    const endpoint = this.endpoint;
    const headers = this.session.requestHeaders();
    if (!endpoint || !headers || !this.claimSlot()) return false;
    try {
      return await this.post(endpoint, endpoint.deviceId, headers, body());
    } catch {
      return false;
    }
  }

  /** At most one user command every MIN_INTERVAL_MS. */
  private claimSlot(): boolean {
    const now = Date.now();
    if (now - this.lastSentAt < MIN_INTERVAL_MS) return false;
    this.lastSentAt = now;
    return true;
  }

  private async post(endpoint: ConnectEndpoint, target: string, headers: Record<string, string>, body: unknown): Promise<boolean> {
    const response = await this.fetchFn(commandUrl(endpoint, target), { method: 'POST', headers, body: JSON.stringify(body) });
    return response.ok;
  }
}
