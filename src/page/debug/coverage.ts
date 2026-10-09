// Compares what Resource Timing saw with what the interceptor captured.
// A persistent gap means requests bypass our wrappers (saved fetch reference, workers, ...).
import { matchEndpoint, type EndpointKind } from '../adapters/endpoints';
import { debugLog, debugWarn } from './log';

type Counts = Record<EndpointKind, number>;

const seen: Counts = { pathfinder: 0, spclient: 0 };
const captured: Counts = { pathfinder: 0, spclient: 0 };
let observer: PerformanceObserver | null = null;

/** Starts counting from zero, together with the interceptor captures. */
export function startCoverage(): void {
  if (observer || typeof PerformanceObserver === 'undefined') return;
  seen.pathfinder = seen.spclient = 0;
  captured.pathfinder = captured.spclient = 0;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const match = matchEndpoint(entry.name);
        if (match) seen[match.kind] += 1;
      }
    });
    observer.observe({ type: 'resource', buffered: false });
  } catch {
    observer = null;
  }
}

export function stopCoverage(): void {
  observer?.disconnect();
  observer = null;
}

export function countCapture(kind: EndpointKind): void {
  captured[kind] += 1;
}

export function logCoverage(): void {
  const line = (kind: EndpointKind) => `${kind} seen ${seen[kind]} / captured ${captured[kind]}`;
  const gap = seen.pathfinder - captured.pathfinder + (seen.spclient - captured.spclient);
  // Small differences are timing noise (entries and captures complete at slightly different moments).
  const log = gap > 2 ? debugWarn : debugLog;
  log(`coverage since start: ${line('pathfinder')}, ${line('spclient')}`);
}
