// Entry point of the code running in the page's JS context (injected by bootstrap).
// Phase 0: passive capture of internal requests, reported only in debug mode.
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

  // Until the settings arrive we capture into a small buffer, so early requests are not lost.
  // Once they arrive with debug off, the wrappers become pure pass-through.
  const hooks: InterceptorHooks = {
    shouldCapture: () => getSettings()?.debug ?? true,
    onCapture: record,
  };
  installFetchInterceptor(window, hooks);
  installXhrInterceptor(window, hooks);
  startCoverage();

  onSettingsChange((settings, previous) => {
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
