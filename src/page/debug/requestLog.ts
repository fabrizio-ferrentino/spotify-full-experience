// Logs one captured request as a collapsed console group: structure only, no values.
import type { PageInfo } from '../adapters/routes';
import { RECON_HIGHLIGHT_KEYS } from '../adapters/reconHints';
import type { CapturedRequest } from '../core/interceptor';
import { maskKey, buildPathMap, formatPathEntry } from './pathMap';
import { debugGroup, debugLog, rawLog } from './log';

/** Host plus the first two path segments (service and version): later segments can hold IDs or usernames. */
export function describeEndpoint(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const shown = segments.slice(0, 2).join('/');
    return `${url.host}/${shown}${segments.length > 2 ? '/…' : ''}`;
  } catch {
    return '<invalid url>';
  }
}

function describeVariables(variables: unknown): string {
  if (variables === undefined) return '(none)';
  if (typeof variables !== 'object' || variables === null || Array.isArray(variables)) return `(${typeof variables})`;
  const parts = Object.entries(variables).map(([key, value]) => {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    return `${maskKey(key)}: ${type}`;
  });
  return parts.length ? parts.join(', ') : '(empty)';
}

export function requestTitle(capture: CapturedRequest): string {
  const name =
    capture.kind === 'pathfinder'
      ? `pathfinder v${capture.pathfinderVersion ?? '?'} ${capture.operationName ?? '<no operationName>'}`
      : `spclient ${describeEndpoint(capture.url)}`;
  return `${capture.method} ${name} → ${capture.status}`;
}

export function logCapture(capture: CapturedRequest): void {
  debugGroup(requestTitle(capture), () => {
    rawLog(`transport: ${capture.transport}, duration: ${capture.durationMs} ms`);
    if (capture.kind === 'pathfinder') {
      rawLog(`hash: ${capture.hash ?? '(none)'}`);
      rawLog(`variables: ${describeVariables(capture.variables)}`);
    } else {
      rawLog(`endpoint: ${describeEndpoint(capture.url)}`);
    }
    rawLog(`request headers: ${capture.requestHeaderNames.join(', ') || '(none visible)'}`);
    rawLog(`response headers: ${capture.responseHeaderNames.join(', ') || '(none visible)'}`);
    rawLog(`content-type: ${capture.contentType ?? '(none)'}`);

    if (capture.json === undefined) {
      rawLog('body: not JSON or unreadable');
      return;
    }
    const map = buildPathMap(capture.json, { highlightKeys: RECON_HIGHLIGHT_KEYS });
    const highlighted = map.entries.filter((entry) => entry.highlighted);
    rawLog(`JSON paths: ${map.entries.length}${map.truncated ? ' (truncated)' : ''}, highlighted: ${highlighted.length}`);
    if (highlighted.length) rawLog(`highlighted paths:\n${highlighted.map(formatPathEntry).join('\n')}`);
    debugGroup('all JSON paths', () => rawLog(map.entries.map(formatPathEntry).join('\n')));
  });
}

/** IDs of catalog pages are public; playlist and collection IDs may be personal, so they are hidden. */
export function logPageChange(page: PageInfo): void {
  const showId = page.kind === 'album' || page.kind === 'artist' || page.kind === 'track';
  debugLog(`──── page: ${page.kind}${showId && page.id ? ` ${page.id}` : ''} ────`);
}
