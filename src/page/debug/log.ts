// Console output for debug mode only. Never log tokens, header values or personal data.
import { getSettings } from '../core/settings';

const PREFIX = '[SFE]';
const STYLE = 'color:#1ed760;font-weight:bold';

export function isDebugEnabled(): boolean {
  return getSettings()?.debug === true;
}

export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled()) console.log(`%c${PREFIX}`, STYLE, ...args);
}

export function debugWarn(...args: unknown[]): void {
  if (isDebugEnabled()) console.warn(PREFIX, ...args);
}
