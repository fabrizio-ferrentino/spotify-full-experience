// Page <-> content script bridge over window.postMessage.
// Settings, the liked songs index and its descriptor cache travel on the bridge. Never put tokens or captured traffic
// here: any script running in the page can read and forge these messages, so everything coming
// from the page is validated on the content script side.
import { parseDescriptorCache, type DescriptorCache } from './descriptorCache';
import { INDEX_KEY, parseLikedIndex, type LikedIndex } from './likedIndex';
import { parseSettings, parseTitleWidth, type Settings } from './settings';

export const BRIDGE_NAMESPACE = 'spotify-full-experience/bridge/v1';

export type PageToContentMessage =
  | { type: 'hello' }
  | { type: 'set-playcounts-title-width'; width: number | null }
  | { type: 'load-liked-index'; key: string }
  | { type: 'save-liked-index'; key: string; index: LikedIndex | null }
  | { type: 'load-descriptors'; key: string }
  | { type: 'save-descriptors'; key: string; cache: DescriptorCache | null };
export type ContentToPageMessage =
  | { type: 'settings'; settings: Settings }
  | { type: 'liked-index'; key: string; index: LikedIndex | null }
  | { type: 'descriptors'; key: string; cache: DescriptorCache | null };

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
  if (record['type'] === 'set-playcounts-title-width') {
    const width = record['width'] === null ? null : parseTitleWidth(record['width']);
    if (width !== null || record['width'] === null) return { type: 'set-playcounts-title-width', width };
  }
  const key = record['key'];
  if (typeof key !== 'string' || !INDEX_KEY.test(key)) return null;
  if (record['type'] === 'load-liked-index') return { type: 'load-liked-index', key };
  if (record['type'] === 'save-liked-index') {
    if (record['index'] === null) return { type: 'save-liked-index', key, index: null };
    const index = parseLikedIndex(record['index']);
    if (index) return { type: 'save-liked-index', key, index };
  }
  if (record['type'] === 'load-descriptors') return { type: 'load-descriptors', key };
  if (record['type'] === 'save-descriptors') {
    if (record['cache'] === null) return { type: 'save-descriptors', key, cache: null };
    const cache = parseDescriptorCache(record['cache']);
    if (cache) return { type: 'save-descriptors', key, cache };
  }
  return null;
}

export function parseContentToPage(data: unknown): ContentToPageMessage | null {
  const record = readEnvelope(data, 'to-page');
  if (!record) return null;
  if (record['type'] === 'settings' && typeof record['settings'] === 'object' && record['settings'] !== null) {
    return { type: 'settings', settings: parseSettings(record['settings']) };
  }
  if (record['type'] === 'liked-index' && typeof record['key'] === 'string' && INDEX_KEY.test(record['key'])) {
    return { type: 'liked-index', key: record['key'], index: parseLikedIndex(record['index']) };
  }
  if (record['type'] === 'descriptors' && typeof record['key'] === 'string' && INDEX_KEY.test(record['key'])) {
    return { type: 'descriptors', key: record['key'], cache: parseDescriptorCache(record['cache']) };
  }
  return null;
}

/** Accept only messages posted by this same window, never from frames or other origins. */
export function isOwnWindowMessage(event: MessageEvent): boolean {
  return event.source === window && event.origin === window.location.origin;
}
