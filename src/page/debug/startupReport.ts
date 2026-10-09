// Measures how late page.js started compared to the player's first requests.
// Uses Resource Timing entries: only counts are reported, never URLs (they can carry variables).
import { matchEndpoint } from '../adapters/endpoints';
import { debugLog } from './log';

export interface StartupSnapshot {
  /** Milliseconds between navigation start and page.js execution. */
  startedAtMs: number;
  readyState: DocumentReadyState;
  /** Endpoint requests already issued before page.js could intercept anything. */
  missed: { pathfinder: number; spclient: number };
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
  return { startedAtMs: Math.round(performance.now()), readyState: document.readyState, missed };
}

export function logStartupReport(snapshot: StartupSnapshot): void {
  debugLog(
    `page script active ${snapshot.startedAtMs} ms after navigation start (readyState: ${snapshot.readyState}).`,
    `Requests issued before injection: pathfinder=${snapshot.missed.pathfinder}, spclient=${snapshot.missed.spclient}.`,
  );
}
