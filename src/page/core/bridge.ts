// Page side of the bridge: announces itself, receives settings, sends layout preferences.
import {
  envelopeToContent,
  isOwnWindowMessage,
  parseContentToPage,
  type PageToContentMessage,
} from '../../shared/protocol';
import type { DescriptorCache } from '../../shared/descriptorCache';
import type { LikedIndex } from '../../shared/likedIndex';
import { setSettings } from './settings';

const pendingIndexLoads = new Map<string, ((index: LikedIndex | null) => void)[]>();
const pendingDescriptorLoads = new Map<string, ((cache: DescriptorCache | null) => void)[]>();
const LOAD_TIMEOUT_MS = 5000;

/** Asks the content script for the stored liked songs index (null if none or on timeout). */
export function loadLikedIndex(key: string): Promise<LikedIndex | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (index: LikedIndex | null) => {
      if (done) return;
      done = true;
      resolve(index);
    };
    const waiting = pendingIndexLoads.get(key) ?? [];
    waiting.push(finish);
    pendingIndexLoads.set(key, waiting);
    setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    sendToContent({ type: 'load-liked-index', key });
  });
}

export function saveLikedIndex(key: string, index: LikedIndex | null): void {
  sendToContent({ type: 'save-liked-index', key, index });
}

/** Asks the content script for the stored descriptor cache (null if none or on timeout). */
export function loadDescriptors(key: string): Promise<DescriptorCache | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (cache: DescriptorCache | null) => {
      if (done) return;
      done = true;
      resolve(cache);
    };
    const waiting = pendingDescriptorLoads.get(key) ?? [];
    waiting.push(finish);
    pendingDescriptorLoads.set(key, waiting);
    setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    sendToContent({ type: 'load-descriptors', key });
  });
}

export function saveDescriptors(key: string, cache: DescriptorCache | null): void {
  sendToContent({ type: 'save-descriptors', key, cache });
}

export function sendToContent(msg: PageToContentMessage): void {
  window.postMessage(envelopeToContent(msg), window.location.origin);
}

export function startBridge(): void {
  window.addEventListener('message', (event) => {
    if (!isOwnWindowMessage(event)) return;
    const msg = parseContentToPage(event.data);
    if (msg?.type === 'settings') setSettings(msg.settings);
    else if (msg?.type === 'liked-index') {
      const waiting = pendingIndexLoads.get(msg.key) ?? [];
      pendingIndexLoads.delete(msg.key);
      for (const resolve of waiting) resolve(msg.index);
    } else if (msg?.type === 'descriptors') {
      const waiting = pendingDescriptorLoads.get(msg.key) ?? [];
      pendingDescriptorLoads.delete(msg.key);
      for (const resolve of waiting) resolve(msg.cache);
    }
  });
  sendToContent({ type: 'hello' });
}
