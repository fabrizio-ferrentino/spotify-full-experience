// Page <-> content script bridge over window.postMessage.
// Only settings travel on the bridge. Never put tokens or captured traffic here:
// any script running in the page can read and forge these messages.
import { parseSettings, type Settings } from './settings';

export const BRIDGE_NAMESPACE = 'spotify-full-experience/bridge/v1';

export type PageToContentMessage = { type: 'hello' };
export type ContentToPageMessage = { type: 'settings'; settings: Settings };

type Direction = 'to-content' | 'to-page';

type Envelope<D extends Direction, M> = M & { ns: typeof BRIDGE_NAMESPACE; dir: D };

export function envelopeToContent(msg: PageToContentMessage): Envelope<'to-content', PageToContentMessage> {
  return { ns: BRIDGE_NAMESPACE, dir: 'to-content', ...msg };
}

export function envelopeToPage(msg: ContentToPageMessage): Envelope<'to-page', ContentToPageMessage> {
  return { ns: BRIDGE_NAMESPACE, dir: 'to-page', ...msg };
}

function readEnvelope(data: unknown, dir: Direction): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record['ns'] !== BRIDGE_NAMESPACE || record['dir'] !== dir) return null;
  return record;
}

export function parsePageToContent(data: unknown): PageToContentMessage | null {
  const record = readEnvelope(data, 'to-content');
  if (!record) return null;
  if (record['type'] === 'hello') return { type: 'hello' };
  return null;
}

export function parseContentToPage(data: unknown): ContentToPageMessage | null {
  const record = readEnvelope(data, 'to-page');
  if (!record) return null;
  if (record['type'] === 'settings' && typeof record['settings'] === 'object' && record['settings'] !== null) {
    return { type: 'settings', settings: parseSettings(record['settings']) };
  }
  return null;
}

/** Accept only messages posted by this same window, never from frames or other origins. */
export function isOwnWindowMessage(event: MessageEvent): boolean {
  return event.source === window && event.origin === window.location.origin;
}
