// Row of genre and mood chips under the action bar, like the desktop app's Liked Songs: rounded
// chips that scroll sideways (with arrows when they overflow); choosing one leaves a ✕ button and
// that chip alone, highlighted.
import { viewLabels } from '../../ui/format';
import { el, icon, ICONS } from '../../ui/typography';
import type { Chip } from './chips';

const OWN = 'data-sfe-chips';
const CHIP =
  'flex: 0 0 auto; height: 32px; padding: 0 12px; border: 0; border-radius: 16px; font: inherit; font-size: 14px; white-space: nowrap; cursor: pointer';
const IDLE = 'rgba(255, 255, 255, 0.07)';
const HOVER = 'rgba(255, 255, 255, 0.12)';
const ROUND =
  'flex: 0 0 32px; width: 32px; height: 32px; border: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff';
const SCROLL_STEP = 320;

export class ChipBar {
  readonly root: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly forward: HTMLButtonElement;
  private renderedKey = '';

  constructor(
    textClass: string,
    private readonly onSelect: (chip: Chip | null) => void,
  ) {
    const labels = viewLabels();
    // `contain: inline-size`: as wide as the page, whatever the chips need, so they scroll.
    this.root = el('div', 'position: relative; display: flex; align-items: center; width: 100%; min-width: 0; contain: inline-size; margin: 0 0 16px', textClass);
    this.root.setAttribute(OWN, '');
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', labels.filterTags);
    this.scroller = el('div', 'display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; scroll-behavior: smooth; flex: 1 1 auto; min-width: 0');
    this.back = this.arrow(ICONS.back, 'left: 0', -SCROLL_STEP);
    this.forward = this.arrow(ICONS.chevron, 'right: 0', SCROLL_STEP);
    this.root.append(this.scroller, this.back, this.forward);
    this.scroller.addEventListener('scroll', () => this.updateArrows());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.updateArrows()).observe(this.scroller);
  }

  /** Shows `chips`, or only `selected` with the ✕ when one is chosen. */
  render(chips: readonly Chip[], selected: Chip | null): void {
    const key = selected ? `selected:${selected.concept}` : chips.map((chip) => chip.concept).join(',');
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const labels = viewLabels();
    if (selected) {
      const clear = el('button', `${ROUND}; background: ${IDLE}`);
      clear.type = 'button';
      clear.setAttribute('aria-label', labels.clearFilter);
      clear.append(icon(ICONS.close, 14));
      clear.addEventListener('click', () => this.onSelect(null));
      this.hover(clear);
      const chip = el('button', `${CHIP}; background: #fff; color: #000`);
      chip.type = 'button';
      chip.textContent = selected.name;
      chip.setAttribute('aria-pressed', 'true');
      chip.addEventListener('click', () => this.onSelect(null));
      this.scroller.replaceChildren(clear, chip);
    } else {
      this.scroller.replaceChildren(
        ...chips.map((item) => {
          const chip = el('button', `${CHIP}; background: ${IDLE}; color: #fff`);
          chip.type = 'button';
          chip.textContent = item.name;
          chip.setAttribute('aria-pressed', 'false');
          chip.addEventListener('click', () => this.onSelect(item));
          this.hover(chip);
          return chip;
        }),
      );
    }
    this.scroller.scrollLeft = 0;
    requestAnimationFrame(() => this.updateArrows());
  }

  remove(): void {
    this.root.remove();
    this.renderedKey = '';
  }

  private hover(button: HTMLElement): void {
    button.addEventListener('mouseenter', () => (button.style.background = HOVER));
    button.addEventListener('mouseleave', () => (button.style.background = IDLE));
  }

  private arrow(path: string, side: string, step: number): HTMLButtonElement {
    const button = el('button', `${ROUND}; position: absolute; top: 0; ${side}; background: #121212; box-shadow: 0 0 12px 8px #121212; display: none`);
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    button.append(icon(path, 14));
    button.addEventListener('click', () => this.scroller.scrollBy({ left: step }));
    return button;
  }

  private updateArrows(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.scroller;
    this.back.style.display = scrollLeft > 1 ? 'flex' : 'none';
    this.forward.style.display = scrollLeft + clientWidth < scrollWidth - 1 ? 'flex' : 'none';
  }
}
