// Entry point of the code running in the page's JS context (injected by bootstrap).
// Passive capture of the player's internal requests, feeding the features and debug mode.
import { DEFAULT_SETTINGS } from '../shared/settings';
import { startBridge } from './core/bridge';
import { installFetchInterceptor, installXhrInterceptor, type InterceptorHooks } from './core/interceptor';
import { currentPage, onPageChange, startRouter } from './core/router';
import { getSettings, onSettingsChange } from './core/settings';
import { logCoverage, startCoverage, stopCoverage } from './debug/coverage';
import { cancelDomProbe, scheduleDomProbe } from './debug/domProbe';
import { debugLog, isDebugEnabled } from './debug/log';
import { mountPanel, unmountPanel } from './debug/panel';
import { clearRecords, flushBuffered, record } from './debug/recorder';
import { logPageChange } from './debug/requestLog';
import { logStartupReport, takeStartupSnapshot } from './debug/startupReport';
import { PlaycountsFeature } from './features/playcounts';

const LOADED = Symbol.for('spotify-full-experience.loaded');

function enterDebug(): void {
  startCoverage();
  mountPanel();
  logPageChange(currentPage());
  scheduleDomProbe(currentPage().kind);
}

function leaveDebug(): void {
  stopCoverage();
  cancelDomProbe();
  unmountPanel();
  clearRecords();
}

function main(): void {
  const globals = window as unknown as Record<symbol, unknown>;
  if (globals[LOADED]) return;
  Object.defineProperty(window, LOADED, { value: true });

  // Taken immediately: it must describe the moment the script started, not when settings arrive.
  const startup = takeStartupSnapshot();

  // Features start with their defaults; the settings arrive a few milliseconds later.
  const playcounts = new PlaycountsFeature();
  if (DEFAULT_SETTINGS.playcounts) playcounts.enable();

  // Until the settings arrive, debug captures go into a small buffer so early requests are not lost.
  // With debug off, only what an enabled feature needs is captured; otherwise the wrappers are pass-through.
  const debugCapturing = () => getSettings()?.debug ?? true;
  const hooks: InterceptorHooks = {
    shouldCapture: (kind) => debugCapturing() || (kind === 'pathfinder' && playcounts.isEnabled),
    onCapture: (capture) => {
      if (debugCapturing()) record(capture);
      try {
        playcounts.onCapture(capture);
      } catch {
        // A failing feature turns itself off silently.
      }
    },
  };
  installFetchInterceptor(window, hooks);
  installXhrInterceptor(window, hooks);
  startCoverage();

  onSettingsChange((settings, previous) => {
    if (settings.playcounts) playcounts.enable();
    else playcounts.disable();

    const wasDebug = previous?.debug ?? false;
    if (settings.debug && !wasDebug) {
      if (previous === null) logStartupReport(startup);
      else debugLog('debug mode enabled');
      enterDebug();
      if (previous === null) flushBuffered();
    } else if (!settings.debug && (wasDebug || previous === null)) {
      leaveDebug();
    }
  });

  onPageChange((page) => {
    playcounts.onPageChange(page);
    if (!isDebugEnabled()) return;
    logCoverage();
    logPageChange(page);
    scheduleDomProbe(page.kind);
  });

  startRouter();
  startBridge();
}

try {
  main();
} catch {
  // Fail-safe: the player must keep working even if our script fails.
}
