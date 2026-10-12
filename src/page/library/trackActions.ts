// The player's track menu entries that our lists add: song radio, credits, taste profile and
// "Open in Desktop app". Each request runs only when the user opens a menu or picks an entry.
import { navigateTo } from '../adapters/spotifyNav';
import {
  collectionUrl,
  creditsVariables,
  CREDITS_OPERATION,
  desktopUri,
  parseContains,
  parseCredits,
  parseSongRadio,
  songRadioUrl,
  tasteProfileBody,
  usernameOf,
  type TrackCredits,
} from '../adapters/trackShapes';
import type { PathfinderClient } from '../core/pathfinderClient';
import type { SpclientRequests } from '../core/spclient';
import type { RowActions } from '../ui/trackList';

export interface TrackActionsDeps {
  spclient: SpclientRequests | null;
  client: PathfinderClient | null;
  /** `spotify:user:<name>` once known (the taste profile requests carry the user name). */
  profileUri: () => string | null;
}

export class TrackActions {
  constructor(private readonly deps: TrackActionsDeps) {}

  /** Opens the song's radio playlist, like the player; false on failure. */
  async songRadio(trackId: string): Promise<boolean> {
    const playlistId = this.deps.spclient ? parseSongRadio(await this.deps.spclient.get(songRadioUrl(trackId))) : null;
    if (!playlistId) return false;
    navigateTo(`/playlist/${playlistId}`);
    return true;
  }

  /** The song's credits, as in the player's dialog. Throws on failure. */
  async credits(trackId: string): Promise<TrackCredits> {
    if (!this.deps.client) throw new Error('no client');
    const result = await this.deps.client.query(CREDITS_OPERATION, creditsVariables(trackId));
    const credits = parseCredits(result.data);
    if (!credits) throw new Error(`unexpected ${CREDITS_OPERATION} response`);
    return credits;
  }

  /** Whether the song is excluded from the taste profile; null when unknown. */
  async isExcluded(trackId: string): Promise<boolean | null> {
    const username = usernameOf(this.deps.profileUri());
    if (!username || !this.deps.spclient) return null;
    return parseContains(await this.deps.spclient.post(collectionUrl('contains'), tasteProfileBody(username, trackId)));
  }

  /** Excludes the song from the taste profile, or includes it again; false on failure. */
  async setExcluded(trackId: string, excluded: boolean): Promise<boolean> {
    const username = usernameOf(this.deps.profileUri());
    if (!username || !this.deps.spclient) return false;
    return (await this.deps.spclient.post(collectionUrl('write'), tasteProfileBody(username, trackId, !excluded))) !== null;
  }

  /** Hands the song to the desktop app through its `spotify:` link. */
  openInDesktop(trackId: string): void {
    const uri = desktopUri(trackId);
    if (!uri) return;
    const link = document.createElement('a');
    link.href = uri;
    link.click();
  }

  /** The row actions of these entries, for our track lists. */
  rowActions(): Pick<RowActions, 'radio' | 'credits' | 'isExcluded' | 'setExcluded' | 'openInDesktop'> {
    return {
      radio: (track) => this.songRadio(track.t),
      credits: (track) => this.credits(track.t),
      isExcluded: (track) => this.isExcluded(track.t),
      setExcluded: (track, excluded) => this.setExcluded(track.t, excluded),
      openInDesktop: (track) => this.openInDesktop(track.t),
    };
  }
}
