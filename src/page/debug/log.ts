// Console output for debug mode only. Never log tokens, header values or personal data.
//
// The player wraps console methods (most likely error-reporting breadcrumbs), which could
// forward our lines to its telemetry. We keep references to the console methods as they
// were when page.js started, which is before the player's bundle runs.
import { getSettings } from '../core/settings';

const PREFIX = '[SFE]';
const STYLE = 'color:#1ed760;font-weight:bold';

const nativeConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  table: console.table.bind(console),
  groupCollapsed: console.groupCollapsed.bind(console),
  groupEnd: console.groupEnd.bind(console),
};

export function isNative(fn: unknown): boolean {
  try {
    return typeof fn === 'function' && Function.prototype.toString.call(fn).includes('[native code]');
  } catch {
    return false;
  }
}

/** Whether console.log was still the browser's own when page.js started. */
export const consoleWasNativeAtStartup = isNative(console.log);

export function isDebugEnabled(): boolean {
  return getSettings()?.debug === true;
}

export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled()) nativeConsole.log(`%c${PREFIX}`, STYLE, ...args);
}

export function debugWarn(...args: unknown[]): void {
  if (isDebugEnabled()) nativeConsole.warn(PREFIX, ...args);
}

export function debugTable(data: unknown): void {
  if (isDebugEnabled()) nativeConsole.table(data);
}

/** Runs `body` inside a collapsed console group; the group is always closed. */
export function debugGroup(title: string, body: () => void): void {
  if (!isDebugEnabled()) return;
  nativeConsole.groupCollapsed(`%c${PREFIX}%c ${title}`, STYLE, '');
  try {
    body();
  } finally {
    nativeConsole.groupEnd();
  }
}

/** Unconditional plain line, for code that already checked debug mode. */
export function rawLog(...args: unknown[]): void {
  if (isDebugEnabled()) nativeConsole.log(...args);
}
