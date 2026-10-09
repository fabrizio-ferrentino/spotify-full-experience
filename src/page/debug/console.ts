// `sfeDebug` console helper, defined only while debug mode is on. It goes through the same
// client as the features (rate limit, backoff), and never exposes header values or tokens.
import type { HashRegistry } from '../core/hashRegistry';
import type { PathfinderClient } from '../core/pathfinderClient';
import type { PlayerCommands } from '../core/player';
import type { Session } from '../core/session';
import { buildPathMap, formatPathEntry } from './pathMap';

const NAME = 'sfeDebug';

export interface DebugConsoleDeps {
  session: Session;
  registry: HashRegistry;
  client: PathfinderClient;
  player?: PlayerCommands | null;
}

export function installDebugConsole({ session, registry, client, player }: DebugConsoleDeps): void {
  const api = Object.freeze({
    /** Session readiness, app version, header names, hash sources, requests sent by us. */
    status: () => ({
      session: { ready: session.ready, appVersion: session.appVersion, headerNames: session.headerNames },
      hashes: registry.describe(),
      requestsSent: client.sent,
      player: player?.describe() ?? null,
    }),
    /** Runs a Pathfinder query through the rate-limited client. */
    query: (operationName: string, variables: Record<string, unknown> = {}) => client.query(operationName, variables),
    /** Key paths of a value (no values), like the request logger. */
    paths: (value: unknown) => buildPathMap(value).entries.map(formatPathEntry),
  });
  Object.defineProperty(window, NAME, { value: api, configurable: true, writable: false, enumerable: false });
}

export function removeDebugConsole(): void {
  try {
    delete (window as unknown as Record<string, unknown>)[NAME];
  } catch {
    // Ignore.
  }
}
