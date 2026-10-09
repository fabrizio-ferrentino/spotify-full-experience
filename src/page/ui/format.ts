// Locale helpers for injected UI. The page language comes from <html lang>, set by the player.

const LABELS = {
  playcounts: { it: 'Riproduzioni', en: 'Plays' },
} as const;

export type LabelKey = keyof typeof LABELS;

export function pageLanguage(): string {
  return document.documentElement.lang || 'en';
}

function baseLanguage(lang: string): string {
  return lang.toLowerCase().split('-')[0] ?? 'en';
}

export function label(key: LabelKey, lang = pageLanguage()): string {
  const entry: Record<string, string> = LABELS[key];
  return entry[baseLanguage(lang)] ?? LABELS[key].en;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Grouped integer in the page locale, e.g. 2.441.116 in Italian, 2,441,116 in English. */
export function formatCount(value: number, lang = pageLanguage()): string {
  let formatter = formatters.get(lang);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    } catch {
      formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
    }
    formatters.set(lang, formatter);
  }
  return formatter.format(value);
}
