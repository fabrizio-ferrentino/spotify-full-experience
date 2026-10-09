// Small context menu for the rows of our liked songs view, styled like the player's menus.
// It is our own menu: the player's native track menu cannot be opened for our elements.
import { el, HOVER } from './typography';

export interface MenuItem {
  label: string;
  action: () => void;
}

const OWN = 'data-sfe-liked-menu';
const WIDTH = 240;

export class ContextMenu {
  private root: HTMLElement | null = null;
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.root && !this.root.contains(event.target as Node)) this.close();
  };
  // Capture phase: Escape closes the menu only, not the view underneath.
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.root) return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly itemClass: string) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens at a viewport point, kept inside the window. */
  open(items: MenuItem[], x: number, y: number): void {
    this.close();
    const menu = el(
      'ul',
      `position: fixed; z-index: 30; min-width: ${WIDTH}px; max-width: 350px; margin: 0; padding: 4px; list-style: none; border-radius: 4px; background: #282828; box-shadow: 0 16px 24px rgba(0,0,0,0.3), 0 6px 8px rgba(0,0,0,0.2)`,
    );
    menu.setAttribute(OWN, '');
    menu.setAttribute('role', 'menu');
    for (const item of items) {
      const entry = el('li', '');
      entry.setAttribute('role', 'none');
      const button = el(
        'button',
        'display: flex; align-items: center; width: 100%; height: 40px; padding: 0 12px; border: 0; border-radius: 2px; background: transparent; color: inherit; text-align: start; cursor: pointer; font: inherit',
        this.itemClass,
      );
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = item.label;
      button.addEventListener('mouseenter', () => (button.style.background = HOVER));
      button.addEventListener('mouseleave', () => (button.style.background = 'transparent'));
      button.addEventListener('click', () => {
        this.close();
        item.action();
      });
      entry.append(button);
      menu.append(entry);
    }
    document.body.append(menu);
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
    this.root = menu;
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('keydown', this.onKey, true);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  close(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    this.root?.remove();
    this.root = null;
  }
}
