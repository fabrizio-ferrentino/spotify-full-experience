// Page side of the bridge: announces itself, receives settings, sends layout preferences.
import {
  envelopeToContent,
  isOwnWindowMessage,
  parseContentToPage,
  type PageToContentMessage,
} from '../../shared/protocol';
import { setSettings } from './settings';

export function sendToContent(msg: PageToContentMessage): void {
  window.postMessage(envelopeToContent(msg), window.location.origin);
}

export function startBridge(): void {
  window.addEventListener('message', (event) => {
    if (!isOwnWindowMessage(event)) return;
    const msg = parseContentToPage(event.data);
    if (msg?.type === 'settings') setSettings(msg.settings);
  });
  sendToContent({ type: 'hello' });
}
