// Detects SPA navigation: patches history.pushState/replaceState and listens to popstate.
import { parseRoute, type PageInfo } from '../adapters/routes';

export type PageChangeListener = (page: PageInfo, pathname: string) => void;

const listeners = new Set<PageChangeListener>();
let lastPathname: string | null = null;
let started = false;

function check(): void {
  const pathname = window.location.pathname;
  if (pathname === lastPathname) return;
  lastPathname = pathname;
  const page = parseRoute(pathname);
  for (const listener of listeners) {
    try {
      listener(page, pathname);
    } catch {
      // A failing listener must not break navigation or the other listeners.
    }
  }
}

function patch(method: 'pushState' | 'replaceState'): void {
  const original = history[method];
  history[method] = function (this: History, ...args: Parameters<History['pushState']>): void {
    const result: void = Reflect.apply(original, this, args);
    try {
      check();
    } catch {
      // Ignore.
    }
    return result;
  };
}

export function onPageChange(listener: PageChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentPage(): PageInfo {
  return parseRoute(window.location.pathname);
}

/** Starts watching navigation and emits the current page once. */
export function startRouter(): void {
  if (started) return;
  started = true;
  patch('pushState');
  patch('replaceState');
  window.addEventListener('popstate', check);
  check();
}
