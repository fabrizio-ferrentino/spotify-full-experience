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
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_STORAGE_KEY, type Settings } from '../shared/settings';

/** Set per build target by scripts/build.mjs. */
declare const __INJECT_PAGE_SCRIPT__: boolean;

function postToPage(msg: ContentToPageMessage): void {
  window.postMessage(envelopeToPage(msg), window.location.origin);
}

function sendSettings(settings: Settings): void {
  postToPage({ type: 'settings', settings });
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
