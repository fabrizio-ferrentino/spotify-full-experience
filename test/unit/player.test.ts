import { describe, expect, it, vi } from 'vitest';
import {
  buildPlayCommand,
  commandUrl,
  likedByArtistContext,
  parseConnectUrl,
  parsePlayParams,
} from '../../src/page/adapters/connectShapes';
import { PlayerCommands } from '../../src/page/core/player';
import { Session } from '../../src/page/core/session';

// Synthetic device IDs and values, shaped like the observed traffic.
const DEVICE = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const COMMAND = `https://gew4-spclient.spotify.com/connect-state/v1/player/command/from/${DEVICE}/to/${DEVICE}`;
const playBody = JSON.stringify({
  command: {
    endpoint: 'play',
    context: { uri: 'spotify:list:x' },
    play_origin: { feature_identifier: 'artist', feature_version: 'web-player_x' },
    options: { license: 'tft', skip_to: { track_uri: 'spotify:track:t' } },
  },
});

describe('connect shapes', () => {
  it('reads the device from commands and from the startup registration', () => {
    expect(parseConnectUrl(COMMAND)).toEqual({ origin: 'https://gew4-spclient.spotify.com', deviceId: DEVICE, fromCommand: true });
    expect(parseConnectUrl(`https://gew4-spclient.spotify.com/connect-state/v1/devices/hobs_${OTHER}`)).toEqual({
      origin: 'https://gew4-spclient.spotify.com',
      deviceId: OTHER,
      fromCommand: false,
    });
    expect(parseConnectUrl('https://evil.example/connect-state/v1/devices/hobs_' + OTHER)).toBeNull();
    expect(parseConnectUrl('https://gew4-spclient.spotify.com/track-playback/v1/x')).toBeNull();
  });

  it('copies license and play origin only from play commands', () => {
    expect(parsePlayParams(playBody)).toEqual({ license: 'tft', playOrigin: { feature_identifier: 'artist', feature_version: 'web-player_x' } });
    expect(parsePlayParams(JSON.stringify({ command: { endpoint: 'add_to_queue' } }))).toBeNull();
    expect(parsePlayParams('not json')).toBeNull();
  });

  it('builds a play command, omitting what was never observed', () => {
    const full = buildPlayCommand('ctx', 'spotify:track:t', { license: 'tft', playOrigin: { a: 1 } }, 'id') as { command: Record<string, unknown> };
    expect(full.command).toMatchObject({ endpoint: 'play', context: { uri: 'ctx', url: 'context://ctx' }, play_origin: { a: 1 }, options: { license: 'tft', skip_to: { track_uri: 'spotify:track:t' } } });
    const bare = buildPlayCommand('ctx', 'spotify:track:t', { license: null, playOrigin: null }, 'id') as { command: Record<string, unknown> };
    expect(bare.command['play_origin']).toBeUndefined();
    expect((bare.command['options'] as Record<string, unknown>)['license']).toBeUndefined();
    expect(likedByArtistContext('spotify:user:u', 'A')).toBe('spotify:user:u:collection:artist:A');
    expect(commandUrl({ origin: 'https://h', deviceId: DEVICE, fromCommand: true })).toBe(`https://h/connect-state/v1/player/command/from/${DEVICE}/to/${DEVICE}`);
  });
});

describe('PlayerCommands', () => {
  function setup() {
    const session = new Session();
    session.observe(new Headers({ authorization: 'Bearer t' }));
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    return { session, fetchFn, player: new PlayerCommands(fetchFn as unknown as typeof fetch, session) };
  }

  it('is not ready until the player revealed its device', async () => {
    const { player, fetchFn } = setup();
    expect(player.ready).toBe(false);
    await expect(player.play('ctx', 'spotify:track:t')).resolves.toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends the command to the observed device with the observed parameters', async () => {
    const { player, fetchFn } = setup();
    player.observe(`https://gew4-spclient.spotify.com/connect-state/v1/devices/hobs_${OTHER}`, null);
    player.observe(COMMAND, playBody);
    // A later registration does not replace the device seen on a command.
    player.observe(`https://gew4-spclient.spotify.com/connect-state/v1/devices/hobs_${OTHER}`, null);
    expect(player.ready).toBe(true);
    await expect(player.play('spotify:user:u:collection:artist:A', 'spotify:track:t')).resolves.toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(COMMAND);
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer t');
    const body = JSON.parse(String(init.body));
    expect(body.command.options.license).toBe('tft');
    expect(body.command.context.uri).toBe('spotify:user:u:collection:artist:A');
  });

  it('reports failures instead of throwing', async () => {
    const { session } = setup();
    const failing = new PlayerCommands((async () => new Response('', { status: 400 })) as unknown as typeof fetch, session);
    failing.observe(COMMAND, null);
    await expect(failing.play('ctx', 'spotify:track:t')).resolves.toBe(false);
  });
});
