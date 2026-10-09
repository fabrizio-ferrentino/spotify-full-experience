import { ext } from '../shared/ext';
import { parseSettings, SETTINGS_STORAGE_KEY, type Settings, type ToggleKey } from '../shared/settings';

const TOGGLES: readonly ToggleKey[] = ['playcounts', 'likedSongs', 'debug'];

async function load(): Promise<Settings> {
  const stored = await ext.storage.local.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

async function save(settings: Settings): Promise<void> {
  await ext.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

async function main(): Promise<void> {
  const status = document.querySelector<HTMLElement>('#status');
  if (!status) return;
  const settings = await load();

  for (const key of TOGGLES) {
    const input = document.querySelector<HTMLInputElement>(`#${key}`);
    if (!input) continue;
    input.checked = settings[key];
    input.disabled = false;
    input.addEventListener('change', async () => {
      try {
        await save({ ...settings, [key]: input.checked });
        settings[key] = input.checked;
        status.textContent = 'Saved.';
      } catch {
        input.checked = settings[key];
        status.textContent = 'Could not save the setting.';
      }
    });
  }
}

void main();
