// Action bar controls of playlist pages, like the desktop app: a magnifier that opens a
// "search in playlist" box, and one button with the current order and the view icon, whose
// menu has "Sort by" and "View as". The player's own "view as" button is hidden while ours is
// there; its two modes are chosen through its own menu (adapters/spotifyDom).
import { chooseNativeView, nativeViewButtonOf } from '../../adapters/spotifyDom';
import { viewLabels } from '../../ui/format';
import { ContextMenu, type MenuItem } from '../../ui/menu';
import type { SortKey, SortState } from '../../ui/trackList';
import { ROUND_BUTTON } from '../../ui/trackList';
import { ACCENT, el, icon, ICONS } from '../../ui/typography';

const OWN = 'data-sfe-playlist-tools';
const HIDDEN = 'data-sfe-hidden';
const QUERY_DELAY_MS = 150;
const SUBDUED = 'var(--text-subdued, #b3b3b3)';
const BASE = 'var(--text-base, #fff)';

export interface ControlsHandlers {
  onQuery(query: string): void;
  onSort(key: SortKey): void;
}

export interface SortChoices {
  /** Orders offered, in menu order. */
  keys: readonly SortKey[];
  label(key: SortKey): string;
}

type ViewMode = 'compact' | 'list';

export class PlaylistControls {
  readonly root: HTMLElement;
  private readonly box: HTMLElement;
  private readonly openButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly clear: HTMLButtonElement;
  private readonly sortLabel: HTMLElement;
  private readonly sortIcon: HTMLElement;
  private readonly sortButton: HTMLButtonElement;
  private readonly menu: ContextMenu;
  private sort: SortState = { key: 'custom', descending: false };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nativeView: HTMLButtonElement | null = null;
  private hiddenNative: HTMLElement | null = null;

  constructor(
    textClass: string,
    private readonly handlers: ControlsHandlers,
    private readonly choices: SortChoices,
  ) {
    const labels = viewLabels();
    this.menu = new ContextMenu(textClass);
    this.root = el('div', 'display: inline-flex; align-items: center; gap: 8px', textClass);
    this.root.setAttribute(OWN, '');

    // Search: a magnifier; once open, a light box with the field and a clear button.
    this.box = el('div', `display: flex; align-items: center; height: 32px; border-radius: 4px; color: ${SUBDUED}; transition: background-color 0.2s`);
    this.openButton = el('button', `${ROUND_BUTTON}; width: 32px; height: 32px; flex: 0 0 32px`);
    this.openButton.type = 'button';
    this.openButton.setAttribute('aria-label', labels.searchInPlaylist);
    this.openButton.append(icon(ICONS.search, 16));
    this.openButton.addEventListener('mouseenter', () => (this.openButton.style.color = BASE));
    this.openButton.addEventListener('mouseleave', () => (this.openButton.style.color = ''));
    this.input = el('input', `width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: ${BASE}; font: inherit; font-size: 14px; transition: width 0.2s`);
    this.input.type = 'text';
    this.input.placeholder = labels.searchInPlaylist;
    this.input.setAttribute('aria-label', labels.searchInPlaylist);
    this.input.tabIndex = -1;
    this.clear = el('button', `${ROUND_BUTTON}; width: 32px; height: 32px; flex: 0 0 32px; display: none`);
    this.clear.type = 'button';
    this.clear.setAttribute('aria-label', labels.clearSearch);
    this.clear.append(icon(ICONS.close, 14));
    this.box.append(this.openButton, this.input, this.clear);
    this.openButton.addEventListener('click', () => (this.isOpen ? this.input.focus() : this.expand()));
    this.input.addEventListener('input', () => this.queryChanged());
    this.input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      this.reset();
    });
    this.input.addEventListener('blur', () => {
      if (!this.input.value) this.collapse();
    });
    this.clear.addEventListener('mousedown', (event) => event.preventDefault()); // keep the focus in the field
    this.clear.addEventListener('click', () => {
      this.input.value = '';
      this.queryChanged(true);
      this.input.focus();
    });

    // Order and view: "Aggiunti di recente ☰", like the desktop app's sort box.
    this.sortButton = el(
      'button',
      `display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 0 0 8px; border: 0; background: transparent; color: ${SUBDUED}; font: inherit; font-size: 14px; cursor: pointer`,
    );
    this.sortButton.type = 'button';
    this.sortButton.setAttribute('aria-haspopup', 'menu');
    this.sortLabel = el('span', 'white-space: nowrap');
    this.sortIcon = el('span', 'display: flex');
    this.sortButton.append(this.sortLabel, this.sortIcon);
    this.sortButton.addEventListener('mouseenter', () => (this.sortButton.style.color = BASE));
    this.sortButton.addEventListener('mouseleave', () => (this.sortButton.style.color = SUBDUED));
    this.sortButton.addEventListener('click', () => {
      const box = this.sortButton.getBoundingClientRect();
      this.menu.open(this.menuItems(), box.right - 200, box.bottom + 4);
    });
    this.root.append(this.box, this.sortButton);
    this.showSort(this.sort);
  }

  get query(): string {
    return this.input.value.trim();
  }

  private get isOpen(): boolean {
    return this.input.tabIndex === 0;
  }

  /**
   * Keeps the controls first in the action bar's right side (the player may re-render it) and
   * the player's "view as" button hidden behind ours.
   */
  mount(trailing: HTMLElement): void {
    if (this.root.parentElement !== trailing || trailing.firstElementChild !== this.root) trailing.prepend(this.root);
    const native = nativeViewButtonOf(trailing);
    const holder = native?.parentElement && native.parentElement !== trailing ? native.parentElement : native;
    if (holder && this.hiddenNative !== holder) {
      this.showNative();
      holder.style.setProperty('display', 'none', 'important');
      holder.setAttribute(HIDDEN, '');
      this.hiddenNative = holder;
    }
    this.nativeView = native;
    this.showViewIcon();
  }

  remove(): void {
    this.menu.close();
    if (this.timer) clearTimeout(this.timer);
    this.showNative();
    this.root.remove();
  }

  showSort(sort: SortState): void {
    this.sort = sort;
    const label = this.choices.label(sort.key);
    this.sortLabel.textContent = label;
    this.sortButton.setAttribute('aria-label', `${viewLabels().sortBy}: ${label}`);
  }

  /** Empties and closes the search box. */
  reset(): void {
    const had = this.input.value !== '';
    this.input.value = '';
    this.collapse();
    this.input.blur();
    if (had) this.queryChanged(true);
  }

  private showNative(): void {
    if (!this.hiddenNative) return;
    this.hiddenNative.style.removeProperty('display');
    this.hiddenNative.removeAttribute(HIDDEN);
    this.hiddenNative = null;
  }

  /** Current mode, from the label of the player's button ("Elenco" / "Compatta"). */
  private viewMode(): ViewMode | null {
    const text = this.nativeView?.textContent?.trim().toLocaleLowerCase();
    const labels = viewLabels();
    if (text === labels.list.toLocaleLowerCase()) return 'list';
    if (text === labels.compact.toLocaleLowerCase()) return 'compact';
    return null;
  }

  private showViewIcon(): void {
    const mode = this.viewMode() ?? 'list';
    if (this.sortIcon.dataset['mode'] === mode) return;
    this.sortIcon.dataset['mode'] = mode;
    this.sortIcon.replaceChildren(icon(mode === 'compact' ? ICONS.viewCompact : ICONS.viewList, 16));
  }

  private expand(): void {
    this.input.style.width = '150px';
    this.input.tabIndex = 0;
    this.box.style.background = 'rgba(255, 255, 255, 0.1)';
    this.box.style.color = BASE;
    this.input.focus();
  }

  private collapse(): void {
    this.input.style.width = '0px';
    this.input.tabIndex = -1;
    this.box.style.background = 'transparent';
    this.box.style.color = SUBDUED;
    this.clear.style.display = 'none';
  }

  private queryChanged(now = false): void {
    this.clear.style.display = this.input.value ? 'flex' : 'none';
    if (this.timer) clearTimeout(this.timer);
    const send = () => this.handlers.onQuery(this.query);
    if (now) send();
    else this.timer = setTimeout(send, QUERY_DELAY_MS);
  }

  private menuItems(): MenuItem[] {
    const labels = viewLabels();
    const items: MenuItem[] = [{ label: labels.sortBy, heading: true }];
    for (const key of this.choices.keys) {
      const selected = key === this.sort.key;
      items.push({
        label: this.choices.label(key),
        selected,
        ...(selected && key !== 'custom'
          ? { trailing: () => icon(this.sort.descending ? ICONS.arrowDown : ICONS.arrowUp, 16) }
          : {}),
        action: () => this.handlers.onSort(key),
      });
    }
    const native = this.nativeView;
    if (native?.isConnected) {
      const mode = this.viewMode();
      items.push({ label: labels.viewAs, heading: true });
      ([
        ['compact', labels.compact, ICONS.viewCompact, 0],
        ['list', labels.list, ICONS.viewList, 1],
      ] as const).forEach(([value, label, path, position]) => {
        const selected = mode === value;
        items.push({
          label,
          selected,
          icon: () => {
            const glyph = icon(path, 16);
            if (selected) glyph.style.color = ACCENT;
            return glyph;
          },
          ...(selected ? { trailing: () => icon(ICONS.check, 16) } : {}),
          action: () => {
            if (selected) return;
            void chooseNativeView(native, label, position).then(() => this.showViewIcon());
          },
        });
      });
    }
    return items;
  }
}
