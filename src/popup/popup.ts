// Toolbar popup and options page: the settings form wired to the extension's storage.
import { ext } from '../shared/ext';
import { parseSettings, SETTINGS_STORAGE_KEY, type Settings, type ToggleKey } from '../shared/settings';
import { renderSettingsForm, type MessageKey } from './settingsForm';

async function load(): Promise<Settings> {
  const stored = await ext.storage.local.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

// Read again before writing: the page may have saved other values (e.g. a column width) meanwhile.
async function save(key: ToggleKey, value: boolean): Promise<Settings> {
  const next = { ...(await load()), [key]: value };
  await ext.storage.local.set({ [SETTINGS_STORAGE_KEY]: next });
  return next;
}

const t = (key: MessageKey) => ext.i18n.getMessage(key) || key;

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  document.documentElement.lang = ext.i18n.getUILanguage();
  const manifest = ext.runtime.getManifest();
  void renderSettingsForm(root, {
    load,
    save,
    t,
    name: manifest.name,
    version: manifest.version,
    iconUrl: ext.runtime.getURL('icons/icon-48.png'),
  });
}
