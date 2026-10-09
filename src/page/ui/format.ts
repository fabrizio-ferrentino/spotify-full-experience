// Locale helpers for injected UI. The page language comes from <html lang>, set by the player.

/**
 * Column labels by language. Only "it" and "en" were checked against the desktop app; the
 * others are reasonable translations, not Spotify's own wording. Keys are lowercase BCP 47
 * tags: a full tag (e.g. "zh-tw") wins over its base language ("zh").
 */
const LABELS = {
  playcounts: {
    en: 'Plays',
    it: 'Riproduzioni',
    es: 'Reproducciones',
    ca: 'Reproduccions',
    fr: 'Lectures',
    de: 'Wiedergaben',
    pt: 'Reproduções',
    nl: 'Afgespeeld',
    sv: 'Spelningar',
    da: 'Afspilninger',
    nb: 'Avspillinger',
    no: 'Avspillinger',
    fi: 'Toistot',
    pl: 'Odtworzenia',
    cs: 'Přehrání',
    sk: 'Prehratia',
    hu: 'Lejátszások',
    ro: 'Redări',
    el: 'Αναπαραγωγές',
    tr: 'Dinlenme',
    ru: 'Прослушивания',
    uk: 'Прослуховування',
    ja: '再生回数',
    ko: '재생 횟수',
    zh: '播放次数',
    'zh-tw': '播放次數',
    'zh-hk': '播放次數',
    id: 'Diputar',
    ms: 'Dimainkan',
    vi: 'Lượt phát',
    th: 'จำนวนครั้งที่เล่น',
    hi: 'प्ले',
    ar: 'مرات التشغيل',
    he: 'השמעות',
  },
} as const;

export type LabelKey = keyof typeof LABELS;

export function pageLanguage(): string {
  return document.documentElement.lang || 'en';
}

export function label(key: LabelKey, lang = pageLanguage()): string {
  const entry: Record<string, string> = LABELS[key];
  const tag = lang.toLowerCase();
  const base = tag.split('-')[0] ?? 'en';
  return entry[tag] ?? entry[base] ?? LABELS[key].en;
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

type LikedMessages = {
  section: string;
  one: string;
  other: (n: string) => string;
  by: (name: string) => string;
  pageTitle: (name: string) => string;
};

/**
 * Artist page texts. Italian follows the desktop app ("Cosa ti è piaciuto", "17 brani",
 * "Di <artista>", "Brani che ti piacciono di <artista>"); the others are reasonable
 * translations. Languages without an entry fall back to English.
 */
const LIKED_MESSAGES: Record<string, LikedMessages> = {
  it: { section: 'Cosa ti è piaciuto', one: '1 brano', other: (n) => `${n} brani`, by: (a) => `Di ${a}`, pageTitle: (a) => `Brani che ti piacciono di ${a}` },
  en: { section: 'Liked songs', one: '1 song', other: (n) => `${n} songs`, by: (a) => `By ${a}`, pageTitle: (a) => `Liked songs by ${a}` },
  es: { section: 'Lo que te gusta', one: '1 canción', other: (n) => `${n} canciones`, by: (a) => `De ${a}`, pageTitle: (a) => `Canciones que te gustan de ${a}` },
  fr: { section: 'Titres likés', one: '1 titre', other: (n) => `${n} titres`, by: (a) => `De ${a}`, pageTitle: (a) => `Titres likés de ${a}` },
  de: { section: 'Lieblingssongs', one: '1 Song', other: (n) => `${n} Songs`, by: (a) => `Von ${a}`, pageTitle: (a) => `Lieblingssongs von ${a}` },
  pt: { section: 'Músicas curtidas', one: '1 música', other: (n) => `${n} músicas`, by: (a) => `De ${a}`, pageTitle: (a) => `Músicas curtidas de ${a}` },
};

function likedMessages(lang: string): LikedMessages {
  const base = lang.toLowerCase().split('-')[0] ?? 'en';
  return LIKED_MESSAGES[base] ?? LIKED_MESSAGES['en']!;
}

export function likedSectionTitle(lang = pageLanguage()): string {
  return likedMessages(lang).section;
}

/** "17 brani", with the number formatted for the page locale. */
export function likedCountText(count: number, lang = pageLanguage()): string {
  const messages = likedMessages(lang);
  return count === 1 ? messages.one : messages.other(formatCount(count, lang));
}

export function byArtistText(name: string, lang = pageLanguage()): string {
  return likedMessages(lang).by(name);
}

export function likedPageTitle(name: string, lang = pageLanguage()): string {
  return likedMessages(lang).pageTitle(name);
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['week', 7 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/** "3 days ago" in the page locale. */
export function relativeTime(timestamp: number, now: number, lang = pageLanguage()): string {
  let format: Intl.RelativeTimeFormat;
  try {
    format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  } catch {
    format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  }
  const elapsed = now - timestamp;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(elapsed) >= size) return format.format(-Math.round(elapsed / size), unit);
  }
  return format.format(0, 'minute');
}
