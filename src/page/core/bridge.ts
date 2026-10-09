// Page side of the bridge: announces itself, receives settings, sends layout preferences.
import {
  envelopeToContent,
  isOwnWindowMessage,
  parseContentToPage,
  type PageToContentMessage,
} from '../../shared/protocol';
import type { LikedIndex } from '../../shared/likedIndex';
import { setSettings } from './settings';

const pendingIndexLoads = new Map<string, ((index: LikedIndex | null) => void)[]>();
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
    }
  });
  sendToContent({ type: 'hello' });
}
