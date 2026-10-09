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
