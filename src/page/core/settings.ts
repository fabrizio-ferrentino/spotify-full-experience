// In-page copy of the user settings, fed by the bridge.
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings';

type Listener = (settings: Settings, previous: Settings | null) => void;

let current: Settings | null = null;
const listeners = new Set<Listener>();

/** Settings received from the content script, or null while still waiting for them. */
export function getSettings(): Settings | null {
  return current;
}

export function getSettingsOrDefault(): Settings {
  return current ?? { ...DEFAULT_SETTINGS };
}

export function setSettings(next: Settings): void {
  const previous = current;
  current = next;
  for (const listener of listeners) {
    try {
      listener(next, previous);
    } catch {
      // A failing listener must not break the others.
    }
  }
}

export function onSettingsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
