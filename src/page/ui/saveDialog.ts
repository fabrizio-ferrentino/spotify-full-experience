// "Save in" dialog of the green tick on our rows, like the desktop app's: the liked songs and
// the user's editable playlists, each with a tick, then Cancel / Done. Done reports only what
// changed; nothing is sent before it.
import type { CurationType, EditablePlaylist } from '../adapters/libraryShapes';
import { viewLabels } from './format';
import { checkIcon, el, emptyCircleIcon, HOVER, icon, ICONS } from './typography';

export interface CurationChange {
  contextUri: string;
  curationType: CurationType;
}

const OWN = 'data-sfe-liked-save';
const WIDTH = 320;
/** Space kept between the dialog and the window edges. */
const MARGIN = 8;

export class SaveDialog {
  private root: HTMLElement | null = null;
  private request = 0;
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.root && !this.root.contains(event.target as Node)) this.close();
  };
  // Capture phase: Escape closes the dialog only, not the view underneath.
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.root) return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly textClass: string) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(
    anchor: HTMLElement,
    load: () => Promise<EditablePlaylist[]>,
    onDone: (changes: CurationChange[]) => void,
    onError: () => void,
  ): void {
    this.close();
    const labels = viewLabels();
    const root = el(
      'div',
      `position: fixed; z-index: 30; width: ${WIDTH}px; max-height: calc(100vh - ${2 * MARGIN}px); display: flex; flex-direction: column; border-radius: 8px; background: #282828; box-shadow: 0 16px 24px rgba(0,0,0,0.3), 0 6px 8px rgba(0,0,0,0.2)`,
      this.textClass,
    );
    root.setAttribute(OWN, '');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', labels.saveIn);

    const title = el('div', 'padding: 16px 16px 8px; font-weight: 700');
    title.textContent = labels.saveIn;
    const field = el(
      'label',
      'display: flex; align-items: center; gap: 8px; height: 36px; margin: 0 12px 8px; padding: 0 12px; border-radius: 4px; background: #3e3e3e; cursor: text',
    );
    const search = el('input', 'flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit');
    search.type = 'search';
    search.placeholder = labels.findPlaylist;
    search.setAttribute('aria-label', labels.findPlaylist);
    field.append(icon(ICONS.search, 16), search);
    // The list scrolls and shrinks first, so the buttons always stay on screen.
    const list = el('ul', 'flex: 0 1 auto; min-height: 0; margin: 0; padding: 0 4px; list-style: none; max-height: min(320px, 50vh); overflow-y: auto');
    const footer = el('div', 'display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 16px 16px');
    const cancel = el(
      'button',
      'height: 32px; padding: 0 16px; border: 0; border-radius: 16px; background: transparent; color: inherit; font: inherit; font-weight: 700; cursor: pointer',
    );
    cancel.type = 'button';
    cancel.textContent = labels.cancel;
    const done = el(
      'button',
      'height: 32px; padding: 0 16px; border: 0; border-radius: 16px; background: #fff; color: #000; font: inherit; font-weight: 700; cursor: pointer',
    );
    done.type = 'button';
    done.textContent = labels.done;
    done.disabled = true;
    footer.append(cancel, done);
    root.append(title, field, list, footer);

    let playlists: EditablePlaylist[] | null = null;
    const chosen = new Map<string, boolean>();
    const placeholder = (text: string) => {
      const item = el('li', 'height: 48px; display: flex; align-items: center; padding: 0 12px; opacity: 0.6');
      item.textContent = text;
      return item;
    };
    // Below the tick when it fits, above otherwise; always inside the window. Run again when
    // the playlists arrive, since the dialog then grows.
    const place = () => {
      if (!root.isConnected) return;
      const box = anchor.getBoundingClientRect();
      const height = root.getBoundingClientRect().height;
      const below = box.bottom + 4 + height + MARGIN <= window.innerHeight;
      const top = below ? box.bottom + 4 : box.top - height - 4;
      root.style.left = `${Math.max(MARGIN, Math.min(box.right - WIDTH, window.innerWidth - WIDTH - MARGIN))}px`;
      root.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN))}px`;
    };
    const render = () => {
      if (!playlists) list.replaceChildren(placeholder('…'));
      else {
        const query = search.value.trim().toLocaleLowerCase();
        const shown = query ? playlists.filter((p) => (p.liked ? labels.likedSongs : p.name).toLocaleLowerCase().includes(query)) : playlists;
        if (shown.length) list.replaceChildren(...shown.map((playlist) => this.row(playlist, chosen, labels.likedSongs)));
        else list.replaceChildren(placeholder(labels.noPlaylists));
      }
      place();
    };
    search.addEventListener('input', render);
    cancel.addEventListener('click', () => this.close());
    done.addEventListener('click', () => {
      const changes: CurationChange[] = [];
      for (const playlist of playlists ?? []) {
        const wanted = chosen.get(playlist.uri) ?? playlist.curates;
        if (wanted !== playlist.curates) changes.push({ contextUri: playlist.uri, curationType: wanted ? 'CURATE' : 'UNCURATE' });
      }
      this.close();
      if (changes.length) onDone(changes);
    });
    document.body.append(root);
    render();
    this.root = root;
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('keydown', this.onKey, true);
    search.focus();

    const request = ++this.request;
    load().then(
      (loaded) => {
        if (request !== this.request) return;
        playlists = loaded;
        done.disabled = false;
        render();
      },
      () => {
        if (request !== this.request) return;
        this.close();
        onError();
      },
    );
  }

  close(): void {
    this.request += 1;
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    this.root?.remove();
    this.root = null;
  }

  private row(playlist: EditablePlaylist, chosen: Map<string, boolean>, likedName: string): HTMLLIElement {
    const item = el('li', '');
    const button = el(
      'button',
      'display: flex; align-items: center; gap: 12px; width: 100%; height: 48px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer',
    );
    button.type = 'button';
    button.setAttribute('role', 'checkbox');
    const cover = el(
      'span',
      'flex: 0 0 32px; width: 32px; height: 32px; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1)',
    );
    if (playlist.liked) {
      cover.style.background = 'linear-gradient(135deg, #450af5, #c4efd9)';
      cover.style.color = '#fff';
      cover.append(icon(ICONS.heart, 14));
    } else if (playlist.imageUrl) {
      const img = el('img', 'width: 100%; height: 100%; object-fit: cover');
      img.src = playlist.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      cover.append(img);
    }
    const name = el('span', 'flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
    name.textContent = playlist.liked ? likedName : playlist.name;
    const mark = el('span', 'display: flex; flex: 0 0 16px; color: rgba(255,255,255,0.6)');
    const paint = () => {
      const checked = chosen.get(playlist.uri) ?? playlist.curates;
      button.setAttribute('aria-checked', String(checked));
      mark.replaceChildren(checked ? checkIcon(16) : emptyCircleIcon(16));
    };
    button.addEventListener('click', () => {
      chosen.set(playlist.uri, !(chosen.get(playlist.uri) ?? playlist.curates));
      paint();
    });
    button.addEventListener('mouseenter', () => (button.style.background = HOVER));
    button.addEventListener('mouseleave', () => (button.style.background = 'transparent'));
    paint();
    button.append(cover, name, mark);
    item.append(button);
    return item;
  }
}
