// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { getSettings, setSettings } from '../../src/page/core/settings';
import { renderSettingsForm, type FormDeps } from '../../src/popup/settingsForm';
import { DEFAULT_SETTINGS, effectiveSettings, parseSettings, type Settings, type ToggleKey } from '../../src/shared/settings';

const localesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/_locales');
const messages = (lang: string) =>
  JSON.parse(readFileSync(path.join(localesDir, lang, 'messages.json'), 'utf8')) as Record<
    string,
    { message: string }
  >;

describe('master switch', () => {
  it('defaults to on and keeps a stored off', () => {
    expect(parseSettings(undefined).enabled).toBe(true);
    expect(parseSettings({ enabled: false }).enabled).toBe(false);
    expect(parseSettings({ enabled: 'no' }).enabled).toBe(true);
  });

  it('turns every feature and debug off, keeping the stored choices otherwise', () => {
    const stored: Settings = { ...DEFAULT_SETTINGS, enabled: false, debug: true, playcountsTitleWidth: 300 };
    expect(effectiveSettings(stored)).toEqual({
      enabled: false,
      debug: false,
      playcounts: false,
      likedSongs: false,
      playlistTools: false,
      likedChips: false,
      playcountsTitleWidth: 300,
    });
    const on: Settings = { ...DEFAULT_SETTINGS, playcounts: false };
    expect(effectiveSettings(on)).toBe(on);
  });

  it('is applied to the settings the page reads', () => {
    setSettings({ ...DEFAULT_SETTINGS, enabled: false });
    expect(getSettings()).toMatchObject({ playcounts: false, likedSongs: false, playlistTools: false, debug: false });
    setSettings({ ...DEFAULT_SETTINGS });
    expect(getSettings()).toMatchObject({ playcounts: true, likedSongs: true, playlistTools: true });
  });
});

describe('settings form', () => {
  let stored: Settings;
  let saves: [ToggleKey, boolean][];
  let root: HTMLElement;

  const deps = (overrides: Partial<FormDeps> = {}): FormDeps => ({
    load: async () => ({ ...stored }),
    save: async (key, value) => {
      saves.push([key, value]);
      stored = { ...stored, [key]: value };
      return { ...stored };
    },
    t: (key) => key,
    name: 'Full Experience for Spotify',
    version: '2026.10.10',
    iconUrl: 'icons/icon-48.png',
    links: { source: 'https://github.com/owner/repo', issues: 'https://github.com/owner/repo/issues/new' },
    ...overrides,
  });

  const input = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)!;
  const toggle = async (id: string) => {
    input(id).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    stored = { ...DEFAULT_SETTINGS, likedSongs: false };
    saves = [];
    root = document.createElement('main');
    document.body.replaceChildren(root);
  });

  it('shows the name, the version and the stored switches', async () => {
    await renderSettingsForm(root, deps());
    expect(root.querySelector('.name')?.textContent).toBe('Full Experience for Spotify');
    expect(root.querySelector('.version')?.textContent).toBe('v2026.10.10');
    expect(input('enabled').checked).toBe(true);
    expect(input('playcounts').checked).toBe(true);
    expect(input('likedSongs').checked).toBe(false);
    expect(input('playlistTools').checked).toBe(true);
    expect(input('debug').checked).toBe(false);
    for (const id of ['enabled', 'playcounts', 'likedSongs', 'playlistTools', 'debug']) {
      expect(input(id).disabled).toBe(false);
      expect(input(id).getAttribute('role')).toBe('switch');
    }
  });

  it('links to the source code and to a new issue, in a new tab', async () => {
    await renderSettingsForm(root, deps());
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.links a')];
    expect(links.map((a) => [a.textContent, a.href, a.target])).toEqual([
      ['sourceCode', 'https://github.com/owner/repo', '_blank'],
      ['reportIssue', 'https://github.com/owner/repo/issues/new', '_blank'],
    ]);
    expect(links.every((a) => a.rel === 'noopener noreferrer')).toBe(true);
  });

  it('saves a feature switch', async () => {
    await renderSettingsForm(root, deps());
    await toggle('likedSongs');
    expect(saves).toEqual([['likedSongs', true]]);
    expect(root.querySelector('.status')?.textContent).toBe('saved');
  });

  it('greys out the features while the extension is off, remembering their state', async () => {
    await renderSettingsForm(root, deps());
    await toggle('enabled');
    expect(saves).toEqual([['enabled', false]]);
    expect(root.classList.contains('off')).toBe(true);
    expect(root.querySelector('.master .state')?.textContent).toBe('masterOff');
    expect(input('playcounts').disabled).toBe(true);
    expect(input('playcounts').checked).toBe(true);
    expect(input('enabled').disabled).toBe(false);

    await toggle('enabled');
    expect(root.classList.contains('off')).toBe(false);
    expect(input('playcounts').disabled).toBe(false);
  });

  it('puts the switch back when saving fails', async () => {
    await renderSettingsForm(
      root,
      deps({
        save: async () => {
          throw new Error('quota');
        },
      }),
    );
    await toggle('playcounts');
    expect(input('playcounts').checked).toBe(true);
    expect(root.querySelector('.status')?.textContent).toBe('saveFailed');
  });

  it('has every message in English and Italian', async () => {
    const used = new Set<string>();
    await renderSettingsForm(
      root,
      deps({
        t: (key) => {
          used.add(key);
          return key;
        },
      }),
    );
    await toggle('playcounts');
    used.add('masterOn').add('masterOff').add('saveFailed');
    const en = messages('en');
    const it = messages('it');
    expect(Object.keys(it).sort()).toEqual(Object.keys(en).sort());
    for (const key of used) {
      expect(en[key]?.message, key).toBeTruthy();
      expect(it[key]?.message, key).toBeTruthy();
    }
  });
});
