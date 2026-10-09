export interface Settings {
  debug: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ debug: false });

export const SETTINGS_STORAGE_KEY = 'settings';

/** Tolerant parser: unknown keys are dropped, invalid values fall back to defaults. */
export function parseSettings(value: unknown): Settings {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    debug: typeof source['debug'] === 'boolean' ? source['debug'] : DEFAULT_SETTINGS.debug,
  };
}
