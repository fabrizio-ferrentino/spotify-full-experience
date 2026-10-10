// "Brani che ti piacciono di <artist>" view, like the desktop app's page. It is a panel laid
// over the player's main view (same box, fixed to the viewport), appended to <body>: the
// player's own DOM is never changed. Back button, Escape, the artist's name or any navigation
// close it. Titles, artists and albums open their pages inside the app. Rows behave like the
// desktop app's: ▶ in place of the number, a green tick that opens "Save in", and a "…" menu
// (also on right click) of our own; the player's native menus cannot be opened for our rows.
import type { LikedTrack } from '../../../shared/likedIndex';
import { LIKED_SONGS_CONTEXT, type EditablePlaylist } from '../../adapters/libraryShapes';
import { albumPath, artistPath, navigateTo, trackPath, trackShareUrl } from '../../adapters/spotifyNav';
import { setText } from '../../core/dom';
import { addedDate, formatDuration, likedCountText, likedPageTitle, viewLabels } from '../../ui/format';
import { ContextMenu, type MenuItem } from './menu';
import { SaveDialog, type CurationChange } from './saveDialog';
import { showToast } from './toast';
import { ACCENT, checkIcon, el, ELLIPSIS, HOVER, icon, ICONS, type Typography } from './typography';

const OWN = 'data-sfe-liked-view';
const PADDING = 24;
const COLUMNS =
  'display: grid; grid-template-columns: 24px minmax(0, 4fr) minmax(0, 2fr) minmax(0, 2fr) minmax(88px, 1fr) 32px; column-gap: 16px; align-items: center; padding: 0 8px 0 16px';
const SELECTED = 'data-sfe-selected';
const SELECTED_BACKGROUND = 'rgba(255, 255, 255, 0.2)';
const ROUND_BUTTON =
  'border: 0; border-radius: 50%; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0';
const MORE = 'M3 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm6.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z';

function copyText(text: string): Promise<boolean> {
  return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true) : Promise.resolve(false);
}

export interface ViewModel {
  artistId: string;
  artistName: string;
  imageUrl: string | null;
  tracks: LikedTrack[];
  now: number;
}

/** What the rows can do; actions left out are not offered. */
export interface RowActions {
  /** Double click, ▶ (default: open the track page, which the player starts). */
  play(track: LikedTrack): void;
  /** Adds the track to the player's queue; false on failure. */
  queue(track: LikedTrack): Promise<boolean>;
  /** The liked songs and the editable playlists, with `curates` for this track. */
  playlists(track: LikedTrack): Promise<EditablePlaylist[]>;
  /** Saves or removes the track in the given contexts; false on failure. */
  curate(track: LikedTrack, changes: CurationChange[]): Promise<boolean>;
}

export class LikedSongsView {
  readonly root: HTMLElement;
  private readonly barTitle: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly menu: ContextMenu;
  private readonly saveDialog: SaveDialog;
  private readonly actions: Partial<RowActions>;
  private tracks: LikedTrack[] = [];
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };
  private readonly onResize = () => this.place();
  private renderedKey = '';
  private artistId = '';

  constructor(
    /** The player's main view: the panel covers exactly its box. */
    private readonly anchor: HTMLElement,
    private readonly typography: Typography,
    private readonly onClose: () => void,
    actions: Partial<RowActions> = {},
  ) {
    this.actions = actions;
    this.menu = new ContextMenu(typography.title);
    this.saveDialog = new SaveDialog(typography.title);
    this.root = el(
      'section',
      'position: fixed; z-index: 20; overflow-y: auto; border-radius: 8px; color: var(--text-base, #fff); background: linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0) 280px), var(--background-base, #121212)',
    );
    this.root.setAttribute(OWN, '');
    this.root.setAttribute('role', 'region');
    this.root.addEventListener('scroll', () => {
      this.menu.close();
      this.saveDialog.close();
    });
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;
    const labels = viewLabels();

    // Sticky bar: back button and title, like the player's top bar.
    const bar = el('div', `position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 16px; height: 64px; padding: 0 ${PADDING}px; background: var(--background-base, #121212)`);
    const back = el(
      'button',
      'flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.6); color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer',
    );
    back.type = 'button';
    back.setAttribute('aria-label', labels.back);
    back.append(icon(ICONS.back, 16));
    back.addEventListener('click', () => this.close());
    // Big green play: the artist's liked songs from the first one, like the desktop app.
    const playAll = el('button', `${ROUND_BUTTON}; flex: 0 0 48px; width: 48px; height: 48px; background: ${ACCENT}; color: #000`);
    playAll.type = 'button';
    playAll.setAttribute('aria-label', labels.play(''));
    playAll.append(icon(ICONS.play, 20));
    playAll.addEventListener('click', () => {
      const first = this.tracks[0];
      if (first) this.play(first);
    });
    playAll.addEventListener('mouseenter', () => (playAll.style.transform = 'scale(1.04)'));
    playAll.addEventListener('mouseleave', () => (playAll.style.transform = ''));
    this.barTitle = el('span', `${ELLIPSIS}; font-weight: 700; font-size: 20px`, typography.title);
    bar.append(back, playAll, this.barTitle);

    // Header: artist picture with the heart badge, big title, count.
    const header = el('div', `display: flex; align-items: flex-end; gap: 24px; padding: 16px ${PADDING}px 24px`);
    this.picture = el('div', 'position: relative; flex: 0 0 120px; width: 120px; height: 120px');
    const text = el('div', 'display: flex; flex-direction: column; gap: 8px; min-width: 0');
    this.title = el('h1', 'margin: 0; font-size: clamp(24px, 4vw, 40px); line-height: 1.15; font-weight: 900; overflow-wrap: anywhere', typography.heading);
    this.count = el('span', typography.subdued);
    text.append(this.title, this.count);
    header.append(this.picture, text);

    // Track list with a sticky column header.
    const head = el('div', `${COLUMNS}; ${typography.subdued}; position: sticky; top: 64px; z-index: 1; height: 36px; margin: 0 ${PADDING}px 8px; background: var(--background-base, #121212); border-bottom: 1px solid rgba(255,255,255,0.1)`);
    const cells = ['#', labels.title, labels.album, labels.added].map((label, i) => {
      const cell = el('span', i === 0 ? 'text-align: end' : ELLIPSIS);
      cell.textContent = label;
      return cell;
    });
    const clock = el('span', 'justify-self: end; display: flex');
    clock.append(icon(ICONS.clock, 16));
    head.append(...cells, clock, el('span'));

    this.list = el('ol', `list-style: none; margin: 0; padding: 0 ${PADDING}px 32px`);
    this.root.append(bar, header, head, this.list);
  }

  get isOpen(): boolean {
    return this.root.isConnected;
  }

  open(model: ViewModel): void {
    if (!this.isOpen) {
      document.body.append(this.root);
      document.addEventListener('keydown', this.onKey);
      window.addEventListener('resize', this.onResize);
      this.resizeObserver?.observe(this.anchor);
      this.place();
    }
    this.update(model);
    this.root.scrollTop = 0;
  }

  /** Removes the panel; the player's page underneath was never touched. Safe to call twice. */
  close(): void {
    this.menu.close();
    this.saveDialog.close();
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    if (!this.root.isConnected) return;
    this.root.remove();
    this.onClose();
  }

  /** Same box as the player's main view. */
  private place(): void {
    const box = this.anchor.getBoundingClientRect();
    Object.assign(this.root.style, { top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` });
  }

  update(model: ViewModel): void {
    this.artistId = model.artistId;
    const pageTitle = likedPageTitle(model.artistName);
    setText(this.barTitle, pageTitle);
    this.renderTitle(pageTitle, model.artistName);
    setText(this.count, likedCountText(model.tracks.length));
    this.tracks = model.tracks;
    this.renderPicture(model.imageUrl);
    const key = model.tracks.map((track) => track.t).join(',');
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.list.replaceChildren(...model.tracks.map((track, i) => this.row(track, i + 1, model.now)));
  }

  /** "Brani che ti piacciono di <artist>", the name links back to the artist page. */
  private renderTitle(pageTitle: string, artistName: string): void {
    if (this.title.dataset['text'] === pageTitle) return;
    this.title.dataset['text'] = pageTitle;
    const at = pageTitle.lastIndexOf(artistName);
    if (at < 0 || !artistName) {
      this.title.textContent = pageTitle;
      return;
    }
    const name = this.link(artistPath(this.artistId), 'color: inherit', () => this.close());
    name.textContent = artistName;
    this.title.replaceChildren(pageTitle.slice(0, at), name, pageTitle.slice(at + artistName.length));
  }

  /**
   * In-app link. Plain clicks run `onClick` (default: navigate inside the app); modified clicks
   * (new tab...) keep the browser behaviour.
   */
  private link(path: string, style: string, onClick: () => void = () => navigateTo(path), className = ''): HTMLAnchorElement {
    const link = el('a', `color: inherit; text-decoration: none; ${style}`, className);
    link.href = path;
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onClick();
    });
    link.addEventListener('mouseenter', () => (link.style.textDecoration = 'underline'));
    link.addEventListener('mouseleave', () => (link.style.textDecoration = 'none'));
    return link;
  }

  /** The artist of this view closes the view (its page is underneath); others navigate. */
  private artistLink(id: string, name: string): HTMLAnchorElement {
    const link = this.link(artistPath(id), '', id === this.artistId ? () => this.close() : undefined);
    link.textContent = name;
    return link;
  }

  private renderPicture(url: string | null): void {
    if (this.picture.dataset['src'] === (url ?? '')) return;
    this.picture.dataset['src'] = url ?? '';
    const image = el('div', `width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.1); box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: ${ACCENT}`);
    if (url) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = url;
      img.alt = '';
      image.append(img);
    } else {
      image.append(icon(ICONS.heart, 40));
    }
    const badge = el('div', `position: absolute; right: 4px; bottom: 4px; width: 32px; height: 32px; border-radius: 50%; background: ${ACCENT}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px var(--background-base, #121212)`);
    badge.append(icon(ICONS.heart, 16));
    this.picture.replaceChildren(image, badge);
  }

  private play(track: LikedTrack): void {
    if (this.actions.play) this.actions.play(track);
    else navigateTo(trackPath(track.t));
  }

  /** Runs a library or player action and reports the outcome in a toast. */
  private report(action: Promise<boolean>, success: string): void {
    void action.catch(() => false).then((ok) => showToast(ok ? success : viewLabels().failed, this.typography.title));
  }

  private openSaveDialog(track: LikedTrack, anchor: HTMLElement): void {
    const { playlists, curate } = this.actions;
    if (!playlists || !curate) return;
    this.menu.close();
    this.saveDialog.open(
      anchor,
      () => playlists(track),
      (changes) => this.report(curate(track, changes), viewLabels().saved),
      () => showToast(viewLabels().failed, this.typography.title),
    );
  }

  private menuItems(track: LikedTrack): MenuItem[] {
    const labels = viewLabels();
    const { queue, playlists, curate } = this.actions;
    const items: MenuItem[] = [];
    if (playlists && curate) {
      items.push({
        label: labels.addToPlaylist,
        icon: () => icon(ICONS.plus, 16),
        submenu: {
          search: labels.findPlaylist,
          empty: labels.noPlaylists,
          items: async () =>
            (await playlists(track))
              .filter((playlist) => !playlist.liked)
              .map((playlist) => ({
                label: playlist.name,
                action: () =>
                  this.report(curate(track, [{ contextUri: playlist.uri, curationType: 'CURATE' }]), labels.addedTo(playlist.name)),
              })),
        },
      });
      items.push({
        label: labels.removeFromLiked,
        icon: () => checkIcon(16),
        action: () =>
          this.report(curate(track, [{ contextUri: LIKED_SONGS_CONTEXT, curationType: 'UNCURATE' }]), labels.removedFromLiked),
      });
    }
    if (queue) {
      items.push({ label: labels.addToQueue, icon: () => icon(ICONS.queue, 16), action: () => this.report(queue(track), labels.addedToQueue) });
    }
    const navigation: MenuItem[] = [];
    const artistId = track.ad[0] ?? track.a;
    if (artistId) {
      navigation.push({
        label: labels.goToArtist,
        icon: () => icon(ICONS.artist, 16),
        action: () => (artistId === this.artistId ? this.close() : navigateTo(artistPath(artistId))),
      });
    }
    if (track.ai) navigation.push({ label: labels.goToAlbum, icon: () => icon(ICONS.album, 16), action: () => navigateTo(albumPath(track.ai!)) });
    navigation.push({
      label: labels.share,
      icon: () => icon(ICONS.share, 16),
      submenu: {
        items: () => [
          {
            label: labels.copyLink,
            icon: () => icon(ICONS.link, 16),
            action: () => this.report(copyText(trackShareUrl(track.t)), labels.linkCopied),
          },
        ],
      },
    });
    if (items.length) navigation[0]!.separator = true;
    return [...items, ...navigation];
  }

  private row(track: LikedTrack, position: number, now: number): HTMLLIElement {
    const { title: titleClass, subdued } = this.typography;
    const row = el('li', `${COLUMNS}; height: 56px; border-radius: 4px`);

    // Number, or ▶ while the row is hovered or focused.
    const index = el('span', `${subdued}; display: flex; justify-content: flex-end; align-items: center; font-variant-numeric: tabular-nums`);
    const number = el('span');
    number.textContent = String(position);
    const play = el('button', `${ROUND_BUTTON}; width: 24px; height: 24px; color: #fff; display: none`);
    play.type = 'button';
    play.setAttribute('aria-label', viewLabels().play(track.n));
    play.append(icon(ICONS.play, 14));
    play.addEventListener('click', () => this.play(track));
    index.append(number, play);

    const main = el('div', 'display: flex; align-items: center; gap: 12px; min-width: 0');
    const cover = el('div', 'flex: 0 0 40px; width: 40px; height: 40px; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,0.1)');
    if (track.c) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = track.c;
      img.alt = '';
      img.loading = 'lazy';
      cover.append(img);
    }
    const text = el('div', 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; flex: 1 1 auto');
    const title = this.link(trackPath(track.t), `${ELLIPSIS}; max-width: 100%`, undefined, titleClass);
    title.textContent = track.n || track.t;
    const line = el('div', `${subdued}; display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%`);
    if (track.e) {
      const badge = el('span', 'flex: 0 0 auto; font-size: 9px; font-weight: 700; line-height: 16px; padding: 0 5px; border-radius: 2px; background: rgba(255,255,255,0.6); color: #000');
      badge.textContent = 'E';
      badge.title = viewLabels().explicit;
      line.append(badge);
    }
    const artists = el('span', ELLIPSIS);
    track.ar.forEach((name, i) => {
      if (i > 0) artists.append(', ');
      const id = track.ad[i];
      artists.append(id ? this.artistLink(id, name) : name);
    });
    line.append(artists);
    text.append(title, line);
    main.append(cover, text);

    const album = track.ai ? this.link(albumPath(track.ai), `${subdued}; ${ELLIPSIS}`) : el('span', `${subdued}; ${ELLIPSIS}`);
    album.textContent = track.al;
    const added = el('span', `${subdued}; ${ELLIPSIS}`);
    added.textContent = addedDate(track.d, now);
    // Green tick before the duration ("Save in"), shown on hover like on the desktop rows.
    const duration = el('span', `${subdued}; justify-self: end; display: flex; align-items: center; gap: 16px; font-variant-numeric: tabular-nums`);
    const time = el('span');
    time.textContent = formatDuration(track.ms);
    const saved = el('button', `${ROUND_BUTTON}; width: 24px; height: 24px; opacity: 0`);
    saved.type = 'button';
    saved.setAttribute('aria-label', viewLabels().saveIn);
    saved.setAttribute('aria-haspopup', 'dialog');
    saved.append(checkIcon(16));
    saved.addEventListener('click', (event) => {
      event.stopPropagation();
      this.openSaveDialog(track, saved);
    });
    if (this.actions.playlists && this.actions.curate) duration.append(saved);
    duration.append(time);

    // "…" button: visible on hover or focus, like the player's rows.
    const more = el('button', `${ROUND_BUTTON}; justify-self: center; width: 32px; height: 32px; opacity: 0`);
    more.type = 'button';
    more.setAttribute('aria-label', viewLabels().more(track.n));
    more.setAttribute('aria-haspopup', 'menu');
    more.append(icon(MORE, 16));
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const box = more.getBoundingClientRect();
      this.menu.open(this.menuItems(track), box.right - 240, box.bottom + 4);
    });

    const paint = () => {
      const selected = row.hasAttribute(SELECTED);
      const active = row.matches(':hover') || row.contains(document.activeElement);
      row.style.background = selected ? SELECTED_BACKGROUND : active ? HOVER : 'transparent';
      for (const control of [saved, more]) control.style.opacity = active ? '1' : '0';
      number.style.display = active ? 'none' : '';
      play.style.display = active ? 'flex' : 'none';
    };
    row.addEventListener('mouseenter', paint);
    row.addEventListener('mouseleave', paint);
    row.addEventListener('focusin', paint);
    row.addEventListener('focusout', () => setTimeout(paint));
    // Like the player's rows: a click selects, a double click plays (see onPlay).
    const onRowControl = (event: Event) => (event.target as Element).closest('a, button') !== null;
    row.addEventListener('click', (event) => {
      if (onRowControl(event)) return;
      for (const other of this.list.querySelectorAll<HTMLElement>(`[${SELECTED}]`)) {
        other.removeAttribute(SELECTED);
        other.style.background = 'transparent';
      }
      row.setAttribute(SELECTED, '');
      paint();
    });
    row.addEventListener('dblclick', (event) => {
      if (onRowControl(event)) return;
      this.play(track);
    });
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.menu.open(this.menuItems(track), event.clientX, event.clientY);
    });

    row.append(index, main, album, added, duration, more);
    return row;
  }
}
