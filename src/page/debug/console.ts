// `sfeDebug` console helper, defined only while debug mode is on. It goes through the same
// client as the features (rate limit, backoff), and never exposes header values or tokens.
import { EXTENDED_METADATA_URL, EXTENSION_KINDS, extendedMetadataBody, readProto } from '../adapters/extendedMetadata';
import type { HashRegistry } from '../core/hashRegistry';
import type { PathfinderClient } from '../core/pathfinderClient';
import type { PlayerCommands } from '../core/player';
import type { Session } from '../core/session';
import type { SpclientRequests } from '../core/spclient';
import { buildPathMap, formatPathEntry } from './pathMap';

const NAME = 'sfeDebug';

export interface DebugConsoleDeps {
  session: Session;
  registry: HashRegistry;
  client: PathfinderClient;
  player?: PlayerCommands | null;
  spclient?: SpclientRequests | null;
}

export function installDebugConsole({ session, registry, client, player, spclient }: DebugConsoleDeps): void {
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
    /**
     * Extended metadata of tracks, as the player requests it (default kind: TRACK_DESCRIPTOR),
     * read as generic protobuf fields. For reconnaissance: one request, spaced like our others.
     */
    metadata: async (trackIds: string[], kind: number = EXTENSION_KINDS.TRACK_DESCRIPTOR) => {
      if (!spclient) return null;
      const uris = trackIds.slice(0, 50).map((id) => `spotify:track:${id}`);
      const bytes = await spclient.postForProtobuf(EXTENDED_METADATA_URL, extendedMetadataBody(uris, kind));
      return bytes ? readProto(bytes) : null;
    },
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
