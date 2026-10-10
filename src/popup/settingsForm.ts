// Settings form shared by the toolbar popup and the options page: a master switch and one
// switch per feature. Storage and translations are passed in, so the form can be tested.
import type { Settings, ToggleKey } from '../shared/settings';

export type MessageKey =
  | 'masterLabel'
  | 'masterOn'
  | 'masterOff'
  | 'featuresHeading'
  | 'playcountsTitle'
  | 'playcountsDesc'
  | 'likedSongsTitle'
  | 'likedSongsDesc'
  | 'playlistToolsTitle'
  | 'playlistToolsDesc'
  | 'advancedHeading'
  | 'debugTitle'
  | 'debugDesc'
  | 'saved'
  | 'saveFailed'
  | 'disclaimer';

export interface FormDeps {
  load(): Promise<Settings>;
  /** Saves one switch and returns the settings as stored. */
  save(key: ToggleKey, value: boolean): Promise<Settings>;
  t(key: MessageKey): string;
  name: string;
  version: string;
  iconUrl: string;
}

type FeatureKey = Exclude<ToggleKey, 'enabled'>;

const FEATURES: readonly { key: FeatureKey; title: MessageKey; desc: MessageKey }[] = [
  { key: 'playcounts', title: 'playcountsTitle', desc: 'playcountsDesc' },
  { key: 'likedSongs', title: 'likedSongsTitle', desc: 'likedSongsDesc' },
  { key: 'playlistTools', title: 'playlistToolsTitle', desc: 'playlistToolsDesc' },
];

const ADVANCED: readonly { key: FeatureKey; title: MessageKey; desc: MessageKey }[] = [
  { key: 'debug', title: 'debugTitle', desc: 'debugDesc' },
];

const STATUS_MS = 1500;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function switchInput(id: string, label: string): HTMLInputElement {
  const input = el('input', 'switch');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-label', label);
  input.disabled = true;
  return input;
}

export async function renderSettingsForm(root: HTMLElement, deps: FormDeps): Promise<void> {
  const { t } = deps;
  const inputs = new Map<ToggleKey, HTMLInputElement>();

  const header = el('header', 'header');
  const logo = el('img', 'logo');
  logo.src = deps.iconUrl;
  logo.alt = '';
  const titles = el('div', 'titles');
  titles.append(el('h1', 'name', deps.name), el('span', 'version', `v${deps.version}`));
  header.append(logo, titles);

  const master = el('section', 'master');
  const masterText = el('label', 'text');
  const masterState = el('small', 'state');
  masterText.append(el('strong', '', t('masterLabel')), masterState);
  const masterInput = switchInput('enabled', t('masterLabel'));
  masterText.htmlFor = masterInput.id;
  master.append(masterText, masterInput);
  inputs.set('enabled', masterInput);

  const group = (heading: MessageKey, items: typeof FEATURES) => {
    const section = el('section', 'group');
    section.append(el('h2', '', t(heading)));
    for (const item of items) {
      const row = el('div', 'row');
      const text = el('label', 'text');
      text.append(el('strong', '', t(item.title)), el('small', '', t(item.desc)));
      const input = switchInput(item.key, t(item.title));
      text.htmlFor = input.id;
      row.append(text, input);
      section.append(row);
      inputs.set(item.key, input);
    }
    return section;
  };

  const features = group('featuresHeading', FEATURES);
  const advanced = group('advancedHeading', ADVANCED);
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const footer = el('footer', 'footer', t('disclaimer'));
  root.replaceChildren(header, master, features, advanced, status, footer);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const say = (text: string) => {
    status.textContent = text;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (status.textContent = ''), STATUS_MS);
  };

  const show = (settings: Settings) => {
    for (const [key, input] of inputs) {
      input.checked = settings[key];
      input.disabled = key !== 'enabled' && !settings.enabled;
    }
    masterInput.disabled = false;
    masterState.textContent = t(settings.enabled ? 'masterOn' : 'masterOff');
    root.classList.toggle('off', !settings.enabled);
  };

  let settings = await deps.load();
  show(settings);

  for (const [key, input] of inputs) {
    input.addEventListener('change', async () => {
      try {
        settings = await deps.save(key, input.checked);
        show(settings);
        say(t('saved'));
      } catch {
        show(settings);
        say(t('saveFailed'));
      }
    });
  }
}
