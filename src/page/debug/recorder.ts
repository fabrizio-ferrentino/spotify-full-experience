// Keeps the latest captures in memory (for the debug panel) and logs them in debug mode.
// Captures that arrive before the settings are buffered, then logged or dropped.
import type { CapturedRequest } from '../core/interceptor';
import { countCapture } from './coverage';
import { isDebugEnabled } from './log';
import { logCapture } from './requestLog';

const MAX_RECORDS = 200;

const records: CapturedRequest[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore.
    }
  }
}

export function record(capture: CapturedRequest): void {
  records.push(capture);
  if (records.length > MAX_RECORDS) records.shift();
  countCapture(capture.kind);
  if (isDebugEnabled()) logCapture(capture);
  notify();
}

/** Called once debug mode turns on: logs what was captured while waiting for the settings. */
export function flushBuffered(): void {
  for (const capture of records) logCapture(capture);
}

export function clearRecords(): void {
  records.length = 0;
  notify();
}

export function getRecords(): readonly CapturedRequest[] {
  return records;
}

export function onRecordsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
