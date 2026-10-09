import { ext } from '../shared/ext';
import { parseSettings, SETTINGS_STORAGE_KEY, type Settings } from '../shared/settings';

async function load(): Promise<Settings> {
  const stored = await ext.storage.local.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

async function save(settings: Settings): Promise<void> {
  await ext.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

async function main(): Promise<void> {
  const debug = document.querySelector<HTMLInputElement>('#debug');
  const status = document.querySelector<HTMLElement>('#status');
  if (!debug || !status) return;

  const settings = await load();
  debug.checked = settings.debug;
  debug.disabled = false;

  debug.addEventListener('change', async () => {
    try {
      await save({ ...settings, debug: debug.checked });
      settings.debug = debug.checked;
      status.textContent = 'Saved.';
    } catch {
      debug.checked = settings.debug;
      status.textContent = 'Could not save the setting.';
    }
  });
}

void main();
