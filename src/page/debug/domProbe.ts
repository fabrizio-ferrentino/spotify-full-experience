// Generic DOM structure dump, used to discover selectors (Phase 0, question 5).
// It assumes no Spotify-specific selector: it only reads data-testid values, ARIA grid roles,
// numeric aria-* attributes and grid layout. It never reads text, aria-label or class names.
import { debugGroup, debugTable, rawLog } from './log';

const GRID_ROLES = '[role="grid"], [role="treegrid"], [role="rowgroup"], [role="row"], [role="columnheader"]';
const NUMERIC_ARIA = ['aria-colcount', 'aria-rowcount', 'aria-colindex', 'aria-rowindex'];
const QUIET_MS = 1500;
const MAX_WAIT_MS = 8000;

function describeElement(el: Element): string {
  const parts = [el.tagName.toLowerCase()];
  const role = el.getAttribute('role');
  if (role) parts.push(`[role=${role}]`);
  const testId = el.getAttribute('data-testid');
  if (testId) parts.push(`[data-testid=${testId}]`);
  for (const name of NUMERIC_ARIA) {
    const value = el.getAttribute(name);
    if (value !== null && /^\d+$/.test(value)) parts.push(`[${name}=${value}]`);
  }
  return parts.join('');
}

function gridSignature(el: Element): string {
  const style = getComputedStyle(el);
  const inline = el instanceof HTMLElement ? el.style.gridTemplateColumns : '';
  const children = [...el.children].map((child) => describeElement(child)).join(' ');
  return [
    describeElement(el),
    `display=${style.display}`,
    style.display.includes('grid') ? `cols=${style.gridTemplateColumns}` : '',
    inline ? `inline-cols=${inline}` : '',
    `children=${el.children.length}: ${children}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

function countBy(values: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function probeDom(label: string): void {
  const root = document.querySelector('main') ?? document.body;
  if (!root) return;
  const testIds = [...root.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid') ?? '');
  const grids = [...root.querySelectorAll(GRID_ROLES)].map(gridSignature);

  debugGroup(`DOM probe (${label}): ${testIds.length} data-testid, ${grids.length} grid-role elements`, () => {
    rawLog(`root: ${describeElement(root)}`);
    debugGroup('data-testid counts', () => debugTable(countBy(testIds)));
    debugGroup('ARIA grid structure (deduplicated)', () => {
      const counts = countBy(grids);
      rawLog(
        Object.entries(counts)
          .map(([signature, count]) => `${count}× ${signature}`)
          .join('\n'),
      );
    });
  });
}

let pending: { observer: MutationObserver; timers: number[] } | null = null;

function cancelPending(): void {
  if (!pending) return;
  pending.observer.disconnect();
  for (const timer of pending.timers) clearTimeout(timer);
  pending = null;
}

/** Probes once the page content has been quiet for a while (or after a maximum wait). */
export function scheduleDomProbe(label: string): void {
  cancelPending();
  const target = document.querySelector('main') ?? document.body;
  if (!target) return;

  const run = () => {
    cancelPending();
    try {
      probeDom(label);
    } catch {
      // Debug only: ignore.
    }
  };
  const quietTimer = () => window.setTimeout(run, QUIET_MS);

  const timers = [window.setTimeout(run, MAX_WAIT_MS), quietTimer()];
  const observer = new MutationObserver(() => {
    if (!pending) return;
    const quiet = pending.timers.pop();
    if (quiet !== undefined) clearTimeout(quiet);
    pending.timers.push(quietTimer());
  });
  observer.observe(target, { childList: true, subtree: true });
  pending = { observer, timers };
}

export function cancelDomProbe(): void {
  cancelPending();
}
