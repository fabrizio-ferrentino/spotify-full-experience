// Short notice at the bottom of the window ("Added to queue"...), like the player's toasts.
import { el } from './typography';

const OWN = 'data-sfe-liked-toast';
const SHOW_MS = 3000;

let current: { node: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

export function showToast(text: string, className = ''): void {
  hideToast();
  const node = el(
    'div',
    // Explicit display: the player's CSS hides `body > div` elements without id or class.
    'display: block; position: fixed; z-index: 40; left: 50%; bottom: 120px; transform: translateX(-50%); max-width: min(480px, calc(100vw - 32px)); padding: 12px 16px; border-radius: 8px; background: #2e77d0; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.5); pointer-events: none; text-align: center',
    className,
  );
  node.setAttribute(OWN, '');
  node.setAttribute('role', 'status');
  node.textContent = text;
  document.body.append(node);
  current = { node, timer: setTimeout(hideToast, SHOW_MS) };
}

export function hideToast(): void {
  if (!current) return;
  clearTimeout(current.timer);
  current.node.remove();
  current = null;
}
