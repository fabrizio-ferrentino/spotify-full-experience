// Page side of the bridge: announces itself and receives settings.
import { envelopeToContent, isOwnWindowMessage, parseContentToPage } from '../../shared/protocol';
import { setSettings } from './settings';

export function startBridge(): void {
  window.addEventListener('message', (event) => {
    if (!isOwnWindowMessage(event)) return;
    const msg = parseContentToPage(event.data);
    if (msg?.type === 'settings') setSettings(msg.settings);
  });
  window.postMessage(envelopeToContent({ type: 'hello' }), window.location.origin);
}
