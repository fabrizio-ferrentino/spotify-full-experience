// Context menu for the rows of our liked songs view, styled like the player's menus, with
// icons, separators and submenus (optionally loaded later and filtered by a search field).
// It is our own menu: the player's native track menu cannot be opened for our elements.
import { el, HOVER, icon, ICONS } from './typography';

export interface Submenu {
  /** Entries, possibly loaded on demand (shown with a placeholder meanwhile). */
  items: () => MenuItem[] | Promise<MenuItem[]>;
  /** Placeholder of a search field that filters the entries by label. */
  search?: string;
  /** Shown when there is nothing to list. */
  empty?: string;
}

export interface MenuItem {
  label: string;
  icon?: () => Element;
  action?: () => void;
  submenu?: Submenu;
  /** Draws a separator above the entry. */
  separator?: boolean;
}

const OWN = 'data-sfe-liked-menu';
const WIDTH = 240;
// Explicit display: the player's CSS hides `body > div` elements without id or class.
const PANEL =
  'display: block; position: fixed; z-index: 30; margin: 0; padding: 4px; list-style: none; border-radius: 4px; background: #282828; box-shadow: 0 16px 24px rgba(0,0,0,0.3), 0 6px 8px rgba(0,0,0,0.2); max-height: calc(100vh - 16px); overflow-y: auto';
const ENTRY =
  'display: flex; align-items: center; gap: 12px; width: 100%; height: 40px; padding: 0 8px 0 12px; border: 0; border-radius: 2px; background: transparent; color: inherit; text-align: start; cursor: pointer; font: inherit';

/** Keeps a fixed panel inside the window. */
function placeInside(panel: HTMLElement, x: number, y: number): void {
  const box = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
  panel.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
}

export class ContextMenu {
  private root: HTMLElement | null = null;
  private sub: HTMLElement | null = null;
  private subOwner: HTMLElement | null = null;
  private subRequest = 0;
  private readonly onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (this.root?.contains(target) || this.sub?.contains(target)) return;
    this.close();
  };
  // Capture phase: Escape closes the submenu, then the menu, never the view underneath.
  private readonly onKey = (event: KeyboardEvent) => {
    if (!this.root) return;
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      if (this.sub) {
        const owner = this.subOwner;
        this.closeSubmenu();
        owner?.focus();
      } else this.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveFocus(event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  constructor(private readonly itemClass: string) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens at a viewport point, kept inside the window. */
  open(items: MenuItem[], x: number, y: number): void {
    this.close();
    const menu = el('ul', `${PANEL}; min-width: ${WIDTH}px; max-width: 350px`);
    menu.setAttribute(OWN, '');
    menu.setAttribute('role', 'menu');
    menu.append(...items.map((item) => this.entry(item, true)));
    document.body.append(menu);
    placeInside(menu, x, y);
    this.root = menu;
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('keydown', this.onKey, true);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  close(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    this.closeSubmenu();
    this.root?.remove();
    this.root = null;
  }

  private entry(item: MenuItem, topLevel: boolean): HTMLLIElement {
    const entry = el('li', item.separator ? 'border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px' : '');
    entry.setAttribute('role', 'none');
    const button = el('button', ENTRY, this.itemClass);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    if (item.icon) {
      const glyph = el('span', 'display: flex; flex: 0 0 16px; justify-content: center; opacity: 0.7');
      glyph.append(item.icon());
      button.append(glyph);
    }
    const text = el('span', 'flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
    text.textContent = item.label;
    button.append(text);
    button.addEventListener('mouseleave', () => {
      if (this.subOwner !== button) button.style.background = 'transparent';
    });
    if (item.submenu) {
      const submenu = item.submenu;
      button.setAttribute('aria-haspopup', 'menu');
      button.append(icon(ICONS.chevron, 16));
      button.addEventListener('mouseenter', () => {
        button.style.background = HOVER;
        this.openSubmenu(button, submenu);
      });
      button.addEventListener('click', () => this.openSubmenu(button, submenu, true));
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') this.openSubmenu(button, submenu, true);
      });
    } else {
      button.addEventListener('mouseenter', () => {
        button.style.background = HOVER;
        if (topLevel) this.closeSubmenu();
      });
      button.addEventListener('click', () => {
        this.close();
        item.action?.();
      });
    }
    entry.append(button);
    return entry;
  }

  private openSubmenu(owner: HTMLElement, submenu: Submenu, focus = false): void {
    if (this.subOwner === owner && this.sub) {
      if (focus) this.sub.querySelector<HTMLElement>('input, button')?.focus();
      return;
    }
    this.closeSubmenu();
    const panel = el('div', `${PANEL}; width: ${WIDTH}px`);
    panel.setAttribute(OWN, '');
    panel.setAttribute('role', 'menu');
    const list = el('ul', 'margin: 0; padding: 0; list-style: none');
    let all: MenuItem[] | null = null;
    let query = '';
    const render = () => {
      if (!all) {
        const loading = el('li', 'height: 40px; display: flex; align-items: center; padding: 0 12px; opacity: 0.6');
        loading.textContent = '…';
        list.replaceChildren(loading);
        return;
      }
      const shown = query ? all.filter((item) => item.label.toLocaleLowerCase().includes(query)) : all;
      if (shown.length === 0) {
        const empty = el('li', 'height: 40px; display: flex; align-items: center; padding: 0 12px; opacity: 0.6');
        empty.textContent = submenu.empty ?? '';
        list.replaceChildren(empty);
      } else list.replaceChildren(...shown.map((item) => this.entry(item, false)));
    };
    if (submenu.search !== undefined) {
      const field = el('label', 'display: flex; align-items: center; gap: 8px; height: 40px; margin: 0 0 4px; padding: 0 12px; border-radius: 4px; background: #3e3e3e; cursor: text');
      field.append(icon(ICONS.search, 16));
      const input = el('input', 'flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit', this.itemClass);
      input.type = 'search';
      input.placeholder = submenu.search;
      input.setAttribute('aria-label', submenu.search);
      input.addEventListener('input', () => {
        query = input.value.trim().toLocaleLowerCase();
        render();
      });
      field.append(input);
      panel.append(field);
    }
    panel.append(list);
    render();
    document.body.append(panel);
    this.sub = panel;
    this.subOwner = owner;
    this.placeSubmenu();
    if (focus) panel.querySelector<HTMLElement>('input, button')?.focus();

    const request = ++this.subRequest;
    void Promise.resolve()
      .then(() => submenu.items())
      .catch(() => [])
      .then((items) => {
        if (request !== this.subRequest || this.sub !== panel) return;
        all = items;
        render();
        this.placeSubmenu();
      });
  }

  /** Next to its entry: on the right, or on the left when there is no room. */
  private placeSubmenu(): void {
    if (!this.sub || !this.subOwner) return;
    const owner = this.subOwner.getBoundingClientRect();
    const width = this.sub.getBoundingClientRect().width;
    const x = owner.right + width + 8 <= window.innerWidth ? owner.right : owner.left - width;
    placeInside(this.sub, x, owner.top - 4);
  }

  private closeSubmenu(): void {
    this.subRequest += 1;
    this.sub?.remove();
    this.sub = null;
    if (this.subOwner) this.subOwner.style.background = 'transparent';
    this.subOwner = null;
  }

  private moveFocus(step: number): void {
    const panel = this.sub?.contains(document.activeElement) ? this.sub : this.root;
    if (!panel) return;
    const buttons = [...panel.querySelectorAll<HTMLElement>('button')];
    if (!buttons.length) return;
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  }
}
