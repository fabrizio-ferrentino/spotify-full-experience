// Isolated content script, runs at document_start.
// Serves settings to page.js over the bridge. On Chromium page.js is declared as a MAIN-world
// content script in the manifest; on Firefox this script injects it with a <script src> tag.
import { ext } from '../shared/ext';
import {
  envelopeToPage,
  isOwnWindowMessage,
  parsePageToContent,
  type ContentToPageMessage,
} from '../shared/protocol';
import { descriptorStorageKeyFor, parseDescriptorCache, type DescriptorCache } from '../shared/descriptorCache';
import { parseLikedIndex, storageKeyFor, type LikedIndex } from '../shared/likedIndex';
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_STORAGE_KEY, type Settings } from '../shared/settings';

/** Set per build target by scripts/build.mjs. */
declare const __INJECT_PAGE_SCRIPT__: boolean;

function postToPage(msg: ContentToPageMessage): void {
  window.postMessage(envelopeToPage(msg), window.location.origin);
}

function sendSettings(settings: Settings): void {
  postToPage({ type: 'settings', settings });
}

async function loadLikedIndex(key: string): Promise<void> {
  let index: LikedIndex | null = null;
  try {
    const storageKey = storageKeyFor(key);
    const stored = await ext.storage.local.get(storageKey);
    index = parseLikedIndex(stored[storageKey]);
  } catch {
    index = null;
  }
  postToPage({ type: 'liked-index', key, index });
}

async function saveLikedIndex(key: string, index: LikedIndex | null): Promise<void> {
  try {
    if (index) await ext.storage.local.set({ [storageKeyFor(key)]: index });
    else await ext.storage.local.remove(storageKeyFor(key));
  } catch {
    // Not saved: the index is rebuilt on a later visit.
  }
}

async function loadDescriptors(key: string): Promise<void> {
  let cache: DescriptorCache | null = null;
  try {
    const storageKey = descriptorStorageKeyFor(key);
    const stored = await ext.storage.local.get(storageKey);
    cache = parseDescriptorCache(stored[storageKey]);
  } catch {
    cache = null;
  }
  postToPage({ type: 'descriptors', key, cache });
}

async function saveDescriptors(key: string, cache: DescriptorCache | null): Promise<void> {
  try {
    if (cache) await ext.storage.local.set({ [descriptorStorageKeyFor(key)]: cache });
    else await ext.storage.local.remove(descriptorStorageKeyFor(key));
  } catch {
    // Not saved: the descriptors are asked again on a later visit.
  }
}

async function saveTitleWidth(width: number | null): Promise<void> {
  try {
    const current = await loadSettings();
    if (current.playcountsTitleWidth === width) return;
    await ext.storage.local.set({ [SETTINGS_STORAGE_KEY]: { ...current, playcountsTitleWidth: width } });
  } catch {
    // Not saved: the layout simply resets on the next visit.
  }
}

async function loadSettings(): Promise<Settings> {
  try {
    const stored = await ext.storage.local.get(SETTINGS_STORAGE_KEY);
    return parseSettings(stored[SETTINGS_STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function injectPageScript(): void {
  const script = document.createElement('script');
  script.src = ext.runtime.getURL('page.js');
  script.async = false;
  script.addEventListener('load', () => script.remove(), { once: true });
  script.addEventListener('error', () => script.remove(), { once: true });
  (document.head ?? document.documentElement).append(script);
}

function main(): void {
  const settingsReady = loadSettings();

  // The two scripts may start in either order, so the handshake goes both ways:
  // answer the page's "hello", and also push the settings once they are loaded.
  window.addEventListener('message', (event) => {
    if (!isOwnWindowMessage(event)) return;
    const msg = parsePageToContent(event.data);
    if (msg?.type === 'hello') void settingsReady.then(sendSettings);
    else if (msg?.type === 'set-playcounts-title-width') void saveTitleWidth(msg.width);
    else if (msg?.type === 'load-liked-index') void loadLikedIndex(msg.key);
    else if (msg?.type === 'save-liked-index') void saveLikedIndex(msg.key, msg.index);
    else if (msg?.type === 'load-descriptors') void loadDescriptors(msg.key);
    else if (msg?.type === 'save-descriptors') void saveDescriptors(msg.key, msg.cache);
  });
  void settingsReady.then(sendSettings);

  ext.storage.onChanged.addListener((changes, area) => {
    const change = changes[SETTINGS_STORAGE_KEY];
    if (area === 'local' && change) sendSettings(parseSettings(change.newValue));
  });

  if (__INJECT_PAGE_SCRIPT__) injectPageScript();
}

try {
  main();
} catch {
  // Fail-safe: if anything goes wrong the page must keep working untouched.
}
