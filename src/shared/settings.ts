export interface Settings {
  debug: boolean;
  /** Feature: play counts column on album pages. */
  playcounts: boolean;
}

export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ debug: false, playcounts: true });

export const SETTINGS_STORAGE_KEY = 'settings';

/** Tolerant parser: unknown keys are dropped, invalid values fall back to defaults. */
export function parseSettings(value: unknown): Settings {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const flag = (key: SettingKey) => (typeof source[key] === 'boolean' ? (source[key] as boolean) : DEFAULT_SETTINGS[key]);
  return { debug: flag('debug'), playcounts: flag('playcounts') };
}
