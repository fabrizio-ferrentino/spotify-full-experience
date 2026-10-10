// Spotify Connect player commands, as the web player sends them (observed live on 2026-10-10,
// double click on an artist's Popular track):
//   POST https://<spclient host>/connect-state/v1/player/command/from/<device>/to/<device>
//   { command: { endpoint: "play", context: { uri, url: "context://<uri>", metadata: {} },
//                play_origin: {...}, options: { license, skip_to: { track_uri }, ... },
//                logging_params: { command_id } } }
// The device ID comes from the player's own requests; license and play_origin are copied from
// its last play command when one was seen, otherwise omitted (CLAUDE.md §2.10).

const COMMAND_PATH = /^\/connect-state\/v1\/player\/command\/from\/([0-9a-f]{16,64})\/to\/[0-9a-f]{16,64}$/;
/**
 * The local player device, from its playback requests (volume at startup, then state):
 * /track-playback/v1/devices/<device>/(volume|state). Not the Connect observer registration
 * (/connect-state/v1/devices/hobs_<...>): that ID is cut to 40 characters with the prefix,
 * so it is not the device ID (checked live on 2026-10-10: 35 vs 40 characters).
 */
const DEVICE_PATH = /^\/track-playback\/v1\/devices\/([0-9a-f]{16,64})\/(?:volume|state)$/;

export interface ConnectEndpoint {
  /** Origin of the spclient host the player talks to (e.g. https://gew4-spclient.spotify.com). */
  origin: string;
  deviceId: string;
  /** True when seen on a command (the most reliable source of the device ID). */
  fromCommand: boolean;
}

export function parseConnectUrl(rawUrl: string): ConnectEndpoint | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/(^|[.-])spclient\.(wg\.)?spotify\.com$/.test(url.hostname)) return null;
  const command = COMMAND_PATH.exec(url.pathname)?.[1];
  if (command) return { origin: url.origin, deviceId: command, fromCommand: true };
  const device = DEVICE_PATH.exec(url.pathname)?.[1];
  if (device) return { origin: url.origin, deviceId: device, fromCommand: false };
  return null;
}

export interface PlayParams {
  license: string | null;
  playOrigin: Record<string, unknown> | null;
}

/** license and play_origin of one of the player's own play commands. */
export function parsePlayParams(body: string | null): PlayParams | null {
  if (!body) return null;
  try {
    const command = (JSON.parse(body) as { command?: Record<string, unknown> }).command;
    if (!command || command['endpoint'] !== 'play') return null;
    const options = command['options'] as Record<string, unknown> | undefined;
    const license = typeof options?.['license'] === 'string' ? options['license'] : null;
    const origin = command['play_origin'];
    const playOrigin = typeof origin === 'object' && origin !== null ? (origin as Record<string, unknown>) : null;
    return { license, playOrigin };
  } catch {
    return null;
  }
}

/** Command URL from this tab's device to `target` (default: this tab). */
export function commandUrl(endpoint: ConnectEndpoint, target = endpoint.deviceId): string {
  return `${endpoint.origin}/connect-state/v1/player/command/from/${endpoint.deviceId}/to/${target}`;
}

/** The player's own read of the Connect state (GET, JSON), used to find the active device. */
export function clusterUrl(endpoint: ConnectEndpoint): string {
  return `${endpoint.origin}/connect-state/v1/cluster`;
}

const DEVICE_ID = /^[0-9a-f]{16,64}$/;

/** `active_device_id` of a Connect cluster, when that device is playing something. */
export function parseActiveDevice(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const cluster = json as Record<string, unknown>;
  const id = cluster['active_device_id'];
  const state = cluster['player_state'] as Record<string, unknown> | undefined;
  if (typeof id !== 'string' || !DEVICE_ID.test(id) || typeof state?.['track'] !== 'object' || state['track'] === null) return null;
  return id;
}

/**
 * `skip_to` takes `track_uid`, `track_index`, `track_uri`, `page_index` (player bundle,
 * 2026-10-10); we send the URI and, from playlists, the row UID (a track can appear twice).
 */
export function buildPlayCommand(contextUri: string, trackUri: string, params: PlayParams, commandId: string, trackUid?: string): unknown {
  return {
    command: {
      context: { uri: contextUri, url: `context://${contextUri}`, metadata: {} },
      ...(params.playOrigin ? { play_origin: params.playOrigin } : {}),
      options: {
        ...(params.license ? { license: params.license } : {}),
        skip_to: { ...(trackUid ? { track_uid: trackUid } : {}), track_uri: trackUri },
        player_options_override: {},
      },
      logging_params: { command_id: commandId },
      endpoint: 'play',
    },
  };
}

/**
 * "Add to queue", as the player builds it for one track (web player bundle, 2026-10-10):
 * `{ command: { track: { uri, metadata: { is_queued: "true" } }, endpoint: "add_to_queue",
 * logging_params: { command_id } } }`, sent to the ACTIVE device, not necessarily this tab.
 * The body of the player's own command is used as a template when one was seen.
 */
export function buildQueueCommand(trackUri: string, template: QueueTemplate | null, commandId: string): unknown {
  const base: QueueTemplate = template ?? { track: { metadata: { is_queued: 'true' } } };
  return {
    command: { ...structuredClone(base), track: { ...structuredClone(base.track), uri: trackUri }, logging_params: { command_id: commandId }, endpoint: 'add_to_queue' },
  };
}

export interface QueueTemplate {
  track: Record<string, unknown>;
  [key: string]: unknown;
}

/** The player's own add_to_queue command, without the per-command fields, or null. */
export function parseQueueTemplate(body: string | null): QueueTemplate | null {
  if (!body) return null;
  try {
    const command = (JSON.parse(body) as { command?: Record<string, unknown> }).command;
    const track = command?.['track'];
    if (!command || command['endpoint'] !== 'add_to_queue' || typeof track !== 'object' || track === null) return null;
    const { uri: _uri, uid: _uid, ...trackRest } = track as Record<string, unknown>;
    const { logging_params: _logging, endpoint: _endpoint, ...rest } = command;
    return { ...rest, track: trackRest };
  } catch {
    return null;
  }
}

/** The desktop app's context for "liked songs by <artist>". */
export function likedByArtistContext(profileUri: string, artistId: string): string {
  return `${profileUri}:collection:artist:${artistId}`;
}

/** The user's liked songs as a context. */
export function likedSongsContext(profileUri: string): string {
  return `${profileUri}:collection`;
}

/** Title of the track shown in the player's "now playing" bar. */
export function nowPlayingTitle(): string | null {
  return document.querySelector('[data-testid="context-item-info-title"]')?.textContent?.trim() ?? null;
}
