export interface Settings {
  /** Master switch: when off, every feature and debug mode are off. */
  enabled: boolean;
  debug: boolean;
  /** Feature: play counts column on album pages. */
  playcounts: boolean;
  /** Feature: liked songs of the artist on artist pages. */
  likedSongs: boolean;
  /** Feature: search and sort in playlists and Liked Songs. */
  playlistTools: boolean;
  /** Title width (px) chosen by dragging the play counts column edge; null for the default layout. */
  playcountsTitleWidth: number | null;
}

export type ToggleKey = 'enabled' | 'debug' | 'playcounts' | 'likedSongs' | 'playlistTools';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabled: true,
  debug: false,
  playcounts: true,
  likedSongs: true,
  playlistTools: true,
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
    enabled: flag('enabled'),
    debug: flag('debug'),
    playcounts: flag('playcounts'),
    likedSongs: flag('likedSongs'),
    playlistTools: flag('playlistTools'),
    playcountsTitleWidth: parseTitleWidth(source['playcountsTitleWidth']),
  };
}

/** Settings as the page applies them: with the master switch off, every toggle is off. */
export function effectiveSettings(settings: Settings): Settings {
  if (settings.enabled) return settings;
  return { ...settings, debug: false, playcounts: false, likedSongs: false, playlistTools: false };
}
