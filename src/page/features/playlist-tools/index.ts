// Feature: search and sort in playlists and Liked Songs, like the desktop app (the web player
// has neither). The controls go in the page's action bar. While nothing is searched or sorted,
// the player's own list is untouched; otherwise it is hidden and our list (ui/trackList) shows
// the filtered or sorted tracks in its place, until the search is cleared or the order reset.
import { likedSongsContext } from '../../adapters/connectShapes';
import type { PageInfo } from '../../adapters/routes';
import { pageTrackListOf, SELECTORS } from '../../adapters/spotifyDom';
import { frameScheduler, whenAvailable } from '../../core/dom';
import type { CapturedRequest } from '../../core/interceptor';
import { OPERATIONS } from '../../adapters/libraryShapes';
import type { LikedLibrary } from '../../library/likedLibrary';
import type { Playback } from '../../library/playback';
import { debugWarn } from '../../debug/log';
import { pageLanguage, viewLabels } from '../../ui/format';
import { TrackList, type ListTrack, type SortKey, type SortState } from '../../ui/trackList';
import { borrowTypography, el, type Typography } from '../../ui/typography';
import { PlaylistControls, type SortChoices } from './controls';
import { nextSort, queryTracks } from './listQuery';
import { PlaylistStore } from './playlistStore';

const OWN_LIST = 'data-sfe-playlist-list';
const HIDDEN = 'data-sfe-hidden';
const CUSTOM: SortState = { key: 'custom', descending: false };
/** Liked Songs come newest first: that is their own order, "Recently added". */
const RECENTLY_ADDED: SortState = { key: 'added', descending: true };
const PLAYLIST_KEYS: readonly SortKey[] = ['custom', 'title', 'artist', 'album', 'added', 'duration'];
/** The desktop app's orders for Liked Songs. */
const LIKED_KEYS: readonly SortKey[] = ['title', 'added', 'artist', 'album'];

function sameSort(a: SortState, b: SortState): boolean {
  return a.key === b.key && (a.key === 'custom' || a.descending === b.descending);
}

interface Target {
  /** Context URI: `spotify:playlist:<id>` or `spotify:collection:tracks`. */
  uri: string;
  liked: boolean;
}

export interface PlaylistToolsDeps {
  library: LikedLibrary;
  playback: Playback;
  store: PlaylistStore;
  now?: () => number;
}

function targetOf(page: PageInfo): Target | null {
  if (page.kind === 'playlist' && page.id) return { uri: `spotify:playlist:${page.id}`, liked: false };
  if (page.kind === 'collection' && page.id === 'tracks') return { uri: 'spotify:collection:tracks', liked: true };
  return null;
}

export class PlaylistToolsFeature {
  private enabled = false;
  private target: Target | null = null;
  private query = '';
  /** Chosen order per playlist, for this session. */
  private readonly sorts = new Map<string, SortState>();
  private tracks: ListTrack[] | null = null;
  private loadError = false;
  private partial: { shown: number; total: number } | null = null;
  private loadToken = 0;
  /** The page content root, observed for the whole visit (the page section inside it is replaced when moving between playlists). */
  private main: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private cancelWait: (() => void) | null = null;
  private controls: PlaylistControls | null = null;
  private typography: Typography | null = null;
  private trackList: TrackList | null = null;
  private container: HTMLElement | null = null;
  private message: HTMLElement | null = null;
  private hidden: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly scheduler = frameScheduler(() => this.sync());
  private readonly now: () => number;

  constructor(private readonly deps: PlaylistToolsDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.unsubscribe = this.deps.library.subscribe(() => this.onLibraryChange());
    if (this.target) this.watch();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stop();
  }

  teardown(): void {
    this.disable();
  }

  onPageChange(page: PageInfo): void {
    const target = targetOf(page);
    if (target?.uri === this.target?.uri) return;
    this.stop();
    this.target = target;
    if (this.enabled && target) this.watch();
  }

  onCapture(capture: CapturedRequest): void {
    if (!this.enabled || capture.kind !== 'pathfinder') return;
    const operation = capture.operationName;
    if (operation === OPERATIONS.playlist || operation === OPERATIONS.playlistContents) {
      if (capture.status >= 200 && capture.status < 300) this.deps.store.observePage(capture.variables, (capture.json as { data?: unknown } | undefined)?.data);
    } else {
      this.deps.store.observeRequest(operation, capture.variables);
    }
  }

  private get defaultSort(): SortState {
    return this.target?.liked ? RECENTLY_ADDED : CUSTOM;
  }

  private get sort(): SortState {
    return (this.target && this.sorts.get(this.target.uri)) ?? this.defaultSort;
  }

  private get active(): boolean {
    return this.query !== '' || !sameSort(this.sort, this.defaultSort);
  }

  private sortChoices(liked: boolean): SortChoices {
    const labels = viewLabels();
    return {
      keys: liked ? LIKED_KEYS : PLAYLIST_KEYS,
      label: (key) => (liked && key === 'added' ? labels.recentlyAdded : labels.sortKeys[key]),
    };
  }

  private watch(): void {
    this.cancelWait = whenAvailable<HTMLElement>(SELECTORS.main, (main) => {
      this.cancelWait = null;
      if (!this.enabled || !this.target) return;
      this.main = main;
      this.observer = new MutationObserver(() => this.scheduler.schedule());
      this.observer.observe(main, { childList: true, subtree: true });
      this.scheduler.schedule();
    });
  }

  /** Back to the player's own page: our controls and list removed, its list shown again. */
  private stop(): void {
    this.cancelWait?.();
    this.cancelWait = null;
    this.observer?.disconnect();
    this.observer = null;
    this.scheduler.cancel();
    this.restoreNative();
    this.controls?.remove();
    this.controls = null;
    this.trackList?.closePopups();
    this.trackList = null;
    this.typography = null;
    this.main = null;
    this.query = '';
    this.tracks = null;
    this.partial = null;
    this.loadError = false;
    this.loadToken += 1;
  }

  private restoreNative(): void {
    if (this.hidden) {
      this.hidden.style.removeProperty('display');
      this.hidden.removeAttribute(HIDDEN);
      this.hidden = null;
    }
    this.container?.remove();
    this.container = null;
    this.message = null;
  }

  private onQuery(query: string): void {
    this.query = query;
    this.loadError = false; // a new search retries a failed load
    this.scheduler.schedule();
  }

  private onSort(key: SortKey): void {
    if (!this.target) return;
    // In Liked Songs the "#" column means their own order, newest first.
    const sort = this.target.liked && key === 'custom' ? RECENTLY_ADDED : nextSort(this.sort, key);
    this.sorts.set(this.target.uri, sort);
    this.controls?.showSort(sort);
    this.trackList?.showSort(sort);
    this.scheduler.schedule();
  }

  private onLibraryChange(): void {
    if (!this.target) return;
    if (this.target.liked && this.tracks) this.tracks = this.likedTracks();
    this.trackList?.invalidate();
    this.scheduler.schedule();
  }

  private likedTracks(): ListTrack[] | null {
    return this.deps.library.index?.tracks ?? null;
  }

  /** Loads every row of the current list (once per activation). */
  private load(target: Target): void {
    if (this.tracks || this.loadError) return;
    const token = ++this.loadToken;
    const done = (tracks: ListTrack[] | null, partial: { shown: number; total: number } | null = null) => {
      if (token !== this.loadToken) return;
      this.tracks = tracks;
      this.loadError = tracks === null;
      this.partial = partial;
      this.scheduler.schedule();
    };
    if (target.liked) {
      void this.deps.library.ensureFresh().then(() => done(this.likedTracks()));
      return;
    }
    // The liked songs index tells which rows get a green tick.
    void this.deps.library.ensureFresh();
    this.deps.store.load(target.uri).then(
      (contents) => done(contents.tracks, contents.partial ? { shown: contents.tracks.length, total: contents.total } : null),
      (error: unknown) => {
        debugWarn('playlist tools: contents unavailable', error instanceof Error ? error.message : error);
        done(null);
      },
    );
  }

  /** Brings the page in line with the state; idempotent, run on every page mutation. */
  private sync(): void {
    const target = this.target;
    // Looked up every time: the player replaces the section when moving between playlists.
    const section = this.main?.querySelector<HTMLElement>(SELECTORS.playlistPage);
    if (!this.enabled || !target || !section) return;
    const typography = (this.typography ??= section.querySelector(SELECTORS.trackRow) ? borrowTypography(section) : null);
    if (!typography) return;

    const trailing = section.querySelector<HTMLElement>(SELECTORS.actionBarTrailing);
    if (trailing) {
      this.controls ??= new PlaylistControls(
        typography.title,
        { onQuery: (q) => this.onQuery(q), onSort: (k) => this.onSort(k) },
        this.sortChoices(target.liked),
      );
      this.controls.showSort(this.sort);
      this.controls.mount(trailing);
    }

    if (!this.active) {
      this.restoreNative();
      return;
    }
    const grid = pageTrackListOf(section, target.liked);
    const wrapper = grid?.parentElement;
    if (!grid || !wrapper) return;
    this.load(target);
    this.showOurs(wrapper, typography, target);
  }

  private showOurs(wrapper: HTMLElement, typography: Typography, target: Target): void {
    if (this.hidden !== wrapper) {
      this.restoreNative();
      this.hidden = wrapper;
    }
    if (wrapper.style.getPropertyValue('display') !== 'none') wrapper.style.setProperty('display', 'none', 'important');
    wrapper.setAttribute(HIDDEN, '');

    if (!this.trackList) {
      const { library, playback } = this.deps;
      this.trackList = new TrackList({
        typography,
        stickyTop: 64,
        padding: 0,
        isLiked: (track) => target.liked || library.isLiked(track.t),
        onSort: (key) => this.onSort(key),
        actions: {
          play: (track) => {
            const profile = library.profileUri;
            const contexts = target.liked ? (profile ? [likedSongsContext(profile)] : []) : [target.uri];
            void playback.play({ trackId: track.t, title: track.n, contexts, ...(track.u && !target.liked ? { uid: track.u } : {}) });
          },
          queue: (track) => playback.queue(track.t),
          playlists: (track) => library.playlistsFor(track.t),
          curate: async (track, changes) => {
            const ok = await library.curate(track.t, changes);
            if (ok && changes.some((change) => change.contextUri === target.uri) && !target.liked) {
              this.deps.store.invalidate(target.uri);
              this.tracks = null;
              this.scheduler.schedule();
            }
            return ok;
          },
        },
      });
      this.trackList.showSort(this.sort);
    }
    if (!this.container) {
      this.container = el('div', '');
      this.container.setAttribute(OWN_LIST, '');
      this.message = el('p', `${typography.subdued}; margin: 16px 0; padding: 0 16px`);
      this.container.append(this.trackList.head, this.message, this.trackList.list);
    }
    if (wrapper.nextElementSibling !== this.container) wrapper.after(this.container);
    this.renderList();
  }

  private renderList(): void {
    const trackList = this.trackList;
    const message = this.message;
    if (!trackList || !message) return;
    const labels = viewLabels();
    let text = '';
    let shown: ListTrack[] = [];
    if (this.loadError) text = labels.failed;
    else if (!this.tracks) text = labels.loading;
    else {
      shown = queryTracks(this.tracks, this.query, this.sort, pageLanguage());
      if (!shown.length && this.query) text = labels.noResults(this.query);
      else if (this.partial) text = labels.partial(this.partial.shown, this.partial.total);
    }
    if (message.textContent !== text) message.textContent = text;
    message.style.display = text ? '' : 'none';
    trackList.render(shown, this.now(), this.query);
  }
}
