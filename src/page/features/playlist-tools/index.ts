// Feature: search and sort in playlists and Liked Songs, like the desktop app (the web player
// has neither), and in albums, where sorting by plays is our own addition. The controls go in
// the page's action bar. While nothing is searched or sorted,
// the player's own list is untouched; otherwise it is hidden and our list (ui/trackList) shows
// the filtered or sorted tracks in its place, until the search is cleared or the order reset.
import { likedSongsContext } from '../../adapters/connectShapes';
import type { PageInfo } from '../../adapters/routes';
import { pageTrackListOf, SELECTORS } from '../../adapters/spotifyDom';
import { frameScheduler, whenAvailable } from '../../core/dom';
import type { CapturedRequest } from '../../core/interceptor';
import { OPERATIONS } from '../../adapters/libraryShapes';
import type { AlbumStore } from './albumStore';
import type { DescriptorLibrary } from '../../library/descriptors';
import { ChipBar } from './chipBar';
import { pickChips, type Chip } from './chips';
import type { LikedLibrary } from '../../library/likedLibrary';
import type { Playback } from '../../library/playback';
import type { TrackActions } from '../../library/trackActions';
import { debugWarn } from '../../debug/log';
import { label, pageLanguage, viewLabels } from '../../ui/format';
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
/** Albums: their own order, then by plays (not in the desktop app), title and duration. */
const ALBUM_KEYS: readonly SortKey[] = ['custom', 'plays', 'title', 'duration'];

function sameSort(a: SortState, b: SortState): boolean {
  return a.key === b.key && (a.key === 'custom' || a.descending === b.descending);
}

type TargetKind = 'playlist' | 'liked' | 'album';

interface Target {
  /** Context URI: `spotify:playlist:<id>`, `spotify:collection:tracks` or `spotify:album:<id>`. */
  uri: string;
  kind: TargetKind;
}

export interface PlaylistToolsDeps {
  library: LikedLibrary;
  playback: Playback;
  store: PlaylistStore;
  albums: AlbumStore;
  /** Song radio, credits, taste profile and "Open in Desktop app" in the row menu. */
  trackActions?: TrackActions;
  /** Genre and mood chips over Liked Songs, like the desktop app. */
  descriptors?: DescriptorLibrary;
  now?: () => number;
}

function targetOf(page: PageInfo): Target | null {
  if (page.kind === 'playlist' && page.id) return { uri: `spotify:playlist:${page.id}`, kind: 'playlist' };
  if (page.kind === 'collection' && page.id === 'tracks') return { uri: 'spotify:collection:tracks', kind: 'liked' };
  if (page.kind === 'album' && page.id) return { uri: `spotify:album:${page.id}`, kind: 'album' };
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
  private chipsEnabled = true;
  /** Chips of Liked Songs, once their descriptors are known (null: not computed yet). */
  private chips: Chip[] | null = null;
  private chip: Chip | null = null;
  private chipBar: ChipBar | null = null;
  private chipsLoading = false;
  private chipsToken = 0;
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

  /** The genre and mood chips over Liked Songs (their own setting). */
  setChipsEnabled(enabled: boolean): void {
    if (enabled === this.chipsEnabled) return;
    this.chipsEnabled = enabled;
    if (!enabled) this.dropChips();
    this.scheduler.schedule();
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
    const ok = capture.status >= 200 && capture.status < 300;
    const data = (capture.json as { data?: unknown } | undefined)?.data;
    if (operation === OPERATIONS.playlist || operation === OPERATIONS.playlistContents) {
      if (ok) this.deps.store.observePage(capture.variables, data);
    } else if (operation === OPERATIONS.album || operation === OPERATIONS.albumTracks) {
      if (ok) this.deps.albums.observePage(capture.variables, data);
    } else {
      this.deps.store.observeRequest(operation, capture.variables);
    }
  }

  private get defaultSort(): SortState {
    return this.target?.kind === 'liked' ? RECENTLY_ADDED : CUSTOM;
  }

  private get sort(): SortState {
    return (this.target && this.sorts.get(this.target.uri)) ?? this.defaultSort;
  }

  private get active(): boolean {
    return this.query !== '' || !sameSort(this.sort, this.defaultSort) || this.chip !== null;
  }

  private sortChoices(kind: TargetKind): SortChoices {
    const labels = viewLabels();
    return {
      keys: kind === 'liked' ? LIKED_KEYS : kind === 'album' ? ALBUM_KEYS : PLAYLIST_KEYS,
      label: (key) => {
        if (key === 'plays') return label('playcounts');
        if (kind === 'liked' && key === 'added') return labels.recentlyAdded;
        if (kind === 'album' && key === 'custom') return labels.albumOrder;
        return labels.sortKeys[key];
      },
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
    this.dropChips();
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
    const sort = this.target.kind === 'liked' && key === 'custom' ? RECENTLY_ADDED : nextSort(this.sort, key);
    this.sorts.set(this.target.uri, sort);
    this.controls?.showSort(sort);
    this.trackList?.showSort(sort);
    this.scheduler.schedule();
  }

  private dropChips(): void {
    this.chipBar?.remove();
    this.chipBar = null;
    this.chip = null;
    this.chips = null;
    this.chipsLoading = false;
    this.chipsToken += 1;
  }

  private onChip(chip: Chip | null): void {
    this.chip = chip;
    this.scheduler.schedule();
  }

  /** Liked Songs: the chips row between the action bar and the list, once descriptors are known. */
  private syncChips(section: HTMLElement, typography: Typography): void {
    const { descriptors, library } = this.deps;
    const wrapper = pageTrackListOf(section, true)?.parentElement;
    if (!this.chipsEnabled || !descriptors || !wrapper) {
      this.chipBar?.remove();
      return;
    }
    const index = library.index;
    if (!this.chips && !this.chipsLoading) {
      this.chipsLoading = true;
      const token = ++this.chipsToken;
      const ready = index ? Promise.resolve() : library.ensureFresh();
      void ready
        .then(() => {
          const ids = (library.index?.tracks ?? []).map((track) => track.t);
          return descriptors.ensure(ids).then((cache) => (cache ? pickChips(ids, cache) : []));
        })
        .catch(() => [])
        .then((chips) => {
          if (token !== this.chipsToken) return;
          this.chips = chips;
          this.chipsLoading = false;
          this.scheduler.schedule();
        });
    }
    if (!this.chips?.length) {
      this.chipBar?.remove();
      return;
    }
    this.chipBar ??= new ChipBar(typography.title, (chip) => this.onChip(chip));
    this.chipBar.render(this.chips, this.chip);
    if (this.chipBar.root.nextElementSibling !== wrapper) wrapper.before(this.chipBar.root);
  }

  private onLibraryChange(): void {
    if (!this.target) return;
    if (this.target.kind === 'liked' && this.chips && !this.chipsLoading) {
      // New or removed liked songs: the chips are computed again (descriptors are cached).
      this.chips = null;
      if (this.chip) this.chip = null;
    }
    if (this.target.kind === 'liked' && this.tracks) this.tracks = this.likedTracks();
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
    if (target.kind === 'liked') {
      void this.deps.library.ensureFresh().then(() => done(this.likedTracks()));
      return;
    }
    // The liked songs index tells which rows get a green tick.
    void this.deps.library.ensureFresh();
    const contents = target.kind === 'album' ? this.deps.albums.load(target.uri) : this.deps.store.load(target.uri);
    contents.then(
      (contents) => done(contents.tracks, contents.partial ? { shown: contents.tracks.length, total: contents.total } : null),
      (error: unknown) => {
        debugWarn(`playlist tools: ${target.kind} contents unavailable`, error instanceof Error ? error.message : error);
        done(null);
      },
    );
  }

  /** Brings the page in line with the state; idempotent, run on every page mutation. */
  private sync(): void {
    const target = this.target;
    // Looked up every time: the player replaces the section when moving between playlists.
    const section = this.main?.querySelector<HTMLElement>(target?.kind === 'album' ? SELECTORS.albumPage : SELECTORS.playlistPage);
    if (!this.enabled || !target || !section) return;
    const typography = (this.typography ??= section.querySelector(SELECTORS.trackRow) ? borrowTypography(section) : null);
    if (!typography) return;

    const trailing = section.querySelector<HTMLElement>(SELECTORS.actionBarTrailing);
    if (trailing) {
      this.controls ??= new PlaylistControls(
        typography.title,
        { onQuery: (q) => this.onQuery(q), onSort: (k) => this.onSort(k) },
        this.sortChoices(target.kind),
      );
      this.controls.showSort(this.sort);
      this.controls.mount(trailing);
    }
    if (target.kind === 'liked') this.syncChips(section, typography);

    if (!this.active) {
      this.restoreNative();
      return;
    }
    const grid = pageTrackListOf(section, target.kind !== 'playlist');
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
        isLiked: (track) => target.kind === 'liked' || library.isLiked(track.t),
        onSort: (key) => this.onSort(key),
        layout: target.kind === 'album' ? 'album' : 'library',
        actions: {
          play: (track) => {
            const profile = library.profileUri;
            const liked = target.kind === 'liked';
            const contexts = liked ? (profile ? [likedSongsContext(profile)] : []) : [target.uri];
            void playback.play({ trackId: track.t, title: track.n, contexts, ...(track.u && !liked ? { uid: track.u } : {}) });
          },
          queue: (track) => playback.queue(track.t),
          playlists: (track) => library.playlistsFor(track.t),
          curate: async (track, changes) => {
            const ok = await library.curate(track.t, changes);
            if (ok && changes.some((change) => change.contextUri === target.uri) && target.kind === 'playlist') {
              this.deps.store.invalidate(target.uri);
              this.tracks = null;
              this.scheduler.schedule();
            }
            return ok;
          },
          ...this.deps.trackActions?.rowActions(),
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
      const chip = this.chip;
      const tracks = chip ? this.tracks.filter((track) => chip.trackIds.has(track.t)) : this.tracks;
      shown = queryTracks(tracks, this.query, this.sort, pageLanguage());
      if (!shown.length && this.query) text = labels.noResults(this.query);
      else if (this.partial) text = labels.partial(this.partial.shown, this.partial.total);
    }
    if (message.textContent !== text) message.textContent = text;
    message.style.display = text ? '' : 'none';
    trackList.render(shown, this.now(), this.query);
  }
}
