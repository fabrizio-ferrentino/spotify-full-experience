export interface Settings {
  debug: boolean;
  /** Feature: play counts column on album pages. */
  playcounts: boolean;
  /** Title width (px) chosen by dragging the play counts column edge; null for the default layout. */
  playcountsTitleWidth: number | null;
}

export type ToggleKey = 'debug' | 'playcounts';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  debug: false,
  playcounts: true,
  playcountsTitleWidth: null,
});

export const SETTINGS_STORAGE_KEY = 'settings';

const MIN_TITLE_WIDTH = 80;
const MAX_TITLE_WIDTH = 4000;

/** A plausible title width in pixels, or null. */
export function parseTitleWidth(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_TITLE_WIDTH && value <= MAX_TITLE_WIDTH
    ? Math.round(value)
    : null;
}

/** Tolerant parser: unknown keys are dropped, invalid values fall back to defaults. */
export function parseSettings(value: unknown): Settings {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const flag = (key: ToggleKey) => (typeof source[key] === 'boolean' ? (source[key] as boolean) : DEFAULT_SETTINGS[key]);
  return {
    debug: flag('debug'),
    playcounts: flag('playcounts'),
    playcountsTitleWidth: parseTitleWidth(source['playcountsTitleWidth']),
  };
}
