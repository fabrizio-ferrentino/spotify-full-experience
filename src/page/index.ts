// Entry point of the code running in the page's JS context (injected by bootstrap).
import { startBridge } from './core/bridge';
import { onSettingsChange } from './core/settings';
import { debugLog } from './debug/log';
import { logStartupReport, takeStartupSnapshot } from './debug/startupReport';

const LOADED = Symbol.for('spotify-full-experience.loaded');

function main(): void {
  const globals = window as unknown as Record<symbol, unknown>;
  if (globals[LOADED]) return;
  Object.defineProperty(window, LOADED, { value: true });

  // Taken immediately: it must describe the moment the script started, not when settings arrive.
  const startup = takeStartupSnapshot();

  onSettingsChange((settings, previous) => {
    if (!settings.debug) return;
    if (previous === null) logStartupReport(startup);
    else if (!previous.debug) debugLog('debug mode enabled');
  });

  startBridge();
}

try {
  main();
} catch {
  // Fail-safe: the player must keep working even if our script fails.
}
