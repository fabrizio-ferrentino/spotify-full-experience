// Measures how late page.js started compared to the player's first requests.
// Uses Resource Timing entries: only counts are reported, never URLs (they can carry variables).
// Entries are created when a request completes, so requests still in flight are not counted;
// the coverage report covers that gap.
import { matchEndpoint } from '../adapters/endpoints';
import { consoleWasNativeAtStartup, debugLog, debugWarn, isNative } from './log';

export interface StartupSnapshot {
  /** Milliseconds between navigation start and page.js execution. */
  startedAtMs: number;
  readyState: DocumentReadyState;
  /** Endpoint requests already completed before page.js could intercept anything. */
  missed: { pathfinder: number; spclient: number };
  fetchWasNative: boolean;
}

export function takeStartupSnapshot(): StartupSnapshot {
  const missed = { pathfinder: 0, spclient: 0 };
  try {
    for (const entry of performance.getEntriesByType('resource')) {
      const match = matchEndpoint(entry.name);
      if (match) missed[match.kind] += 1;
    }
  } catch {
    // Resource Timing unavailable: report zeros.
  }
  return {
    startedAtMs: Math.round(performance.now()),
    readyState: document.readyState,
    missed,
    fetchWasNative: isNative(window.fetch),
  };
}

export function logStartupReport(snapshot: StartupSnapshot): void {
  debugLog(
    `page script active ${snapshot.startedAtMs} ms after navigation start (readyState: ${snapshot.readyState}).`,
    `Requests completed before injection: pathfinder=${snapshot.missed.pathfinder}, spclient=${snapshot.missed.spclient}.`,
  );
  if (!snapshot.fetchWasNative) debugWarn('window.fetch was already wrapped by someone else when page.js started.');
  if (!consoleWasNativeAtStartup) {
    debugWarn('console was already wrapped when page.js started: debug lines may reach the player telemetry.');
  }
}
