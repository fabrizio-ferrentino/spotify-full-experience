// Spotify Connect player commands, as the web player sends them (observed live on 2026-10-10,
// double click on an artist's Popular track):
//   POST https://<spclient host>/connect-state/v1/player/command/from/<device>/to/<device>
//   { command: { endpoint: "play", context: { uri, url: "context://<uri>", metadata: {} },
//                play_origin: {...}, options: { license, skip_to: { track_uri }, ... },
//                logging_params: { command_id } } }
// The device ID comes from the player's own requests; license and play_origin are copied from
// its last play command when one was seen, otherwise omitted (CLAUDE.md §2.10).

const COMMAND_PATH = /^\/connect-state\/v1\/player\/command\/from\/([0-9a-f]{16,64})\/to\/[0-9a-f]{16,64}$/;
/** Device registration at startup: PUT /connect-state/v1/devices/hobs_<device>. */
const DEVICE_PATH = /^\/connect-state\/v1\/devices\/hobs_([0-9a-f]{16,64})$/;

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

export function commandUrl(endpoint: ConnectEndpoint): string {
  return `${endpoint.origin}/connect-state/v1/player/command/from/${endpoint.deviceId}/to/${endpoint.deviceId}`;
}

export function buildPlayCommand(contextUri: string, trackUri: string, params: PlayParams, commandId: string): unknown {
  return {
    command: {
      context: { uri: contextUri, url: `context://${contextUri}`, metadata: {} },
      ...(params.playOrigin ? { play_origin: params.playOrigin } : {}),
      options: {
        ...(params.license ? { license: params.license } : {}),
        skip_to: { track_uri: trackUri },
        player_options_override: {},
      },
      logging_params: { command_id: commandId },
      endpoint: 'play',
    },
  };
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
