// Playback from our lists, only on an explicit user action (CLAUDE.md §2.10): a Connect "play"
// with the given contexts in order, each confirmed by the player's "now playing" bar, then the
// track page as a fallback (the web player starts it by itself when this tab is active).
import { nowPlayingTitle } from '../adapters/connectShapes';
import { navigateTo, trackPath } from '../adapters/spotifyNav';
import type { PlayerCommands } from '../core/player';
import { debugLog } from '../debug/log';

/** How long to wait for the player to show the requested track before trying the next way. */
const PLAY_CONFIRM_MS = 4000;

function waitForNowPlaying(title: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (nowPlayingTitle() === title.trim()) resolve(true);
      else if (Date.now() - started >= timeoutMs) resolve(false);
      else setTimeout(check, 250);
    };
    check();
  });
}

export interface PlayRequest {
  trackId: string;
  /** Title shown by the player once it plays the track (confirmation). */
  title: string;
  /** Row ID in a playlist, when known (tracks can appear twice). */
  uid?: string;
  /** Contexts to try in order (e.g. the artist's liked songs, then all liked songs). */
  contexts: string[];
}

export class Playback {
  constructor(private readonly player: PlayerCommands | null) {}

  async play({ trackId, title, uid, contexts }: PlayRequest): Promise<void> {
    const player = this.player;
    const trackUri = `spotify:track:${trackId}`;
    const usable = player?.ready ? contexts : [];
    for (const context of usable) {
      if ((await player!.play(context, trackUri, uid)) && (await waitForNowPlaying(title, PLAY_CONFIRM_MS))) {
        debugLog(`playback: playing via context ${usable.indexOf(context) + 1} of ${usable.length}`);
        return;
      }
    }
    debugLog(
      usable.length
        ? 'playback: play commands not confirmed by the player, opening the track page'
        : `playback: play command unavailable (${!player ? 'no player' : !player.ready ? `player not ready: ${JSON.stringify(player.describe())}` : 'no context'}), opening the track page`,
    );
    navigateTo(trackPath(trackId));
  }

  async queue(trackId: string): Promise<boolean> {
    const player = this.player;
    if (!player?.ready) {
      debugLog(`playback: queue command unavailable (${player ? JSON.stringify(player.describe()) : 'no player'})`);
      return false;
    }
    return player.queue(`spotify:track:${trackId}`);
  }
}
