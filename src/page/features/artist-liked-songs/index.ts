// Feature: on artist pages, "You've liked N songs by <artist>" (primary artist only, as on the
// desktop app), from the shared local index of the user's liked songs (library/likedLibrary).
import { likedByArtistContext, likedSongsContext } from '../../adapters/connectShapes';
import { OPERATIONS, parseArtistOverview, type ArtistInfo } from '../../adapters/libraryShapes';
import type { PageInfo } from '../../adapters/routes';
import { headerTitleOf, mainViewportOf, popularBlockOf, SELECTORS } from '../../adapters/spotifyDom';
import { frameScheduler, whenAvailable } from '../../core/dom';
import type { CapturedRequest } from '../../core/interceptor';
import { tracksByArtist } from '../../library/indexSync';
import type { LikedLibrary } from '../../library/likedLibrary';
import type { Playback } from '../../library/playback';
import type { TrackActions } from '../../library/trackActions';
import { LikedSongsCard } from './card';
import { LikedSongsView, type ViewModel } from './view';

export interface LikedSongsDeps {
  library: LikedLibrary;
  playback: Playback;
  /** Song radio, credits, taste profile and "Open in Desktop app" in the row menu. */
  trackActions?: TrackActions;
  now?: () => number;
}

export class ArtistLikedSongsFeature {
  private enabled = false;
  private artistId: string | null = null;
  private readonly artists = new Map<string, ArtistInfo>();
  private card: LikedSongsCard | null = null;
  private view: LikedSongsView | null = null;
  private mainObserver: MutationObserver | null = null;
  private cancelWait: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly scheduler = frameScheduler(() => this.render());
  private readonly now: () => number;

  constructor(private readonly deps: LikedSongsDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.unsubscribe = this.deps.library.subscribe(() => this.scheduler.schedule());
    if (this.artistId) this.showArtist();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopWatching();
  }

  teardown(): void {
    this.disable();
  }

  onPageChange(page: PageInfo): void {
    this.artistId = page.kind === 'artist' ? page.id : null;
    this.stopWatching();
    if (this.enabled && this.artistId) this.showArtist();
  }

  onCapture(capture: CapturedRequest): void {
    if (!this.enabled || capture.kind !== 'pathfinder' || capture.operationName !== OPERATIONS.artistOverview) return;
    const artist = parseArtistOverview(capture.json);
    if (!artist) return;
    this.artists.set(artist.id, artist);
    if (artist.id === this.artistId) this.scheduler.schedule();
  }

  /** Loads and refreshes the index if needed, then renders the card when the page is ready. */
  private showArtist(): void {
    this.watchPage();
    void this.deps.library.ensureFresh().then(() => this.scheduler.schedule());
  }

  /** Re-renders when the page content changes (the Popular block appears late). */
  private watchPage(): void {
    if (this.mainObserver || this.cancelWait) return;
    this.cancelWait = whenAvailable<HTMLElement>(SELECTORS.main, (main) => {
      this.cancelWait = null;
      if (!this.enabled || !this.artistId) return;
      this.mainObserver = new MutationObserver(() => this.scheduler.schedule());
      this.mainObserver.observe(main, { childList: true, subtree: true });
      this.scheduler.schedule();
    });
  }

  private stopWatching(): void {
    this.cancelWait?.();
    this.cancelWait = null;
    this.mainObserver?.disconnect();
    this.mainObserver = null;
    this.scheduler.cancel();
    this.view?.close();
    this.view = null;
    this.card?.remove();
    this.card = null;
  }

  private viewModel(artistId: string, name: string): ViewModel {
    const index = this.deps.library.index;
    return {
      artistId,
      artistName: name,
      imageUrl: this.artists.get(artistId)?.imageUrl ?? null,
      tracks: index ? tracksByArtist(index, artistId) : [],
      now: this.now(),
    };
  }

  private artistName(artistId: string, main: HTMLElement | null): string | null {
    return this.artists.get(artistId)?.name ?? (main ? headerTitleOf(main) : null);
  }

  /** Shows "Brani che ti piacciono di <artist>" in place of the artist page content. */
  private openView(): void {
    const artistId = this.artistId;
    const card = this.card;
    const main = document.querySelector<HTMLElement>(SELECTORS.main);
    const name = artistId ? this.artistName(artistId, main) : null;
    if (!artistId || !card || !main || !name) return;
    const { library, playback } = this.deps;
    this.view?.close();
    this.view = new LikedSongsView(mainViewportOf(main), card.typography, () => (this.view = null), {
      // Like the desktop app: the artist's liked songs from this track, else all liked songs.
      play: (track) => {
        const profile = library.profileUri;
        const contexts = profile ? [likedByArtistContext(profile, artistId), likedSongsContext(profile)] : [];
        void playback.play({ trackId: track.t, title: track.n, contexts });
      },
      queue: (track) => playback.queue(track.t),
      playlists: (track) => library.playlistsFor(track.t),
      curate: (track, changes) => library.curate(track.t, changes),
      ...this.deps.trackActions?.rowActions(),
    });
    this.view.open(this.viewModel(artistId, name));
  }

  private render(): void {
    const artistId = this.artistId;
    const index = this.deps.library.index;
    if (!this.enabled || !artistId || !index) return;
    const tracks = tracksByArtist(index, artistId);
    if (tracks.length === 0) {
      this.view?.close();
      this.card?.remove();
      this.card = null;
      return;
    }
    const main = document.querySelector<HTMLElement>(SELECTORS.main);
    const block = main ? popularBlockOf(main) : null;
    if (!block) return;
    if (!this.card || !this.card.mounted) {
      this.card?.remove();
      this.card = new LikedSongsCard(block, () => this.openView());
    }
    const name = this.artistName(artistId, main);
    if (!name) return;
    this.card.update({ artistName: name, imageUrl: this.artists.get(artistId)?.imageUrl ?? null, count: tracks.length });
    this.card.mount();
    if (this.view?.isOpen) this.view.update(this.viewModel(artistId, name));
  }
}
