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

// Formatters are costly to create and lists format a date per row: one per language.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** The formatter of `lang` (English when the tag is invalid), created once. */
function cached<T>(cache: Map<string, T>, lang: string, create: (tag: string) => T): T {
  let format = cache.get(lang);
  if (!format) {
    try {
      format = create(lang);
    } catch {
      format = create('en');
    }
    cache.set(lang, format);
  }
  return format;
}

/** "3 days ago" in the page locale. */
export function relativeTime(timestamp: number, now: number, lang = pageLanguage()): string {
  const format = cached(relativeFormats, lang, (tag) => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }));
  const elapsed = now - timestamp;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(elapsed) >= size) return format.format(-Math.round(elapsed / size), unit);
  }
  return format.format(0, 'minute');
}

type ViewLabels = {
  title: string;
  album: string;
  added: string;
  back: string;
  explicit: string;
  play: (track: string) => string;
  more: (track: string) => string;
  goToArtist: string;
  goToAlbum: string;
  copyLink: string;
  addToPlaylist: string;
  removeFromLiked: string;
  addToQueue: string;
  share: string;
  saveIn: string;
  findPlaylist: string;
  likedSongs: string;
  noPlaylists: string;
  cancel: string;
  done: string;
  addedToQueue: string;
  removedFromLiked: string;
  addedTo: (playlist: string) => string;
  saved: string;
  linkCopied: string;
  failed: string;
  saveToLiked: string;
  savedToLiked: string;
  searchInPlaylist: string;
  clearSearch: string;
  sortBy: string;
  sortKeys: Record<'custom' | 'title' | 'artist' | 'album' | 'added' | 'duration', string>;
  noResults: (query: string) => string;
  loading: string;
  partial: (shown: number, total: number) => string;
  viewAs: string;
  compact: string;
  list: string;
  recentlyAdded: string;
  albumOrder: string;
  excludeFromTaste: string;
  includeInTaste: string;
  excludedFromTaste: string;
  includedInTaste: string;
  songRadio: string;
  viewCredits: string;
  openInDesktop: string;
  credits: string;
  close: string;
  sources: string;
  filterTags: string;
  clearFilter: string;
};

const VIEW_LABELS: Record<string, ViewLabels> = {
  it: {
    title: 'Titolo', album: 'Album', added: 'Aggiunto il giorno', back: 'Indietro', explicit: 'Esplicito',
    play: (t) => `Riproduci ${t}`, more: (t) => `Altre opzioni per ${t}`, goToArtist: "Vai all'artista", goToAlbum: "Vai all'album", copyLink: 'Copia link del brano',
    addToPlaylist: 'Aggiungi alla playlist', removeFromLiked: 'Rimuovi dai brani che ti piacciono', addToQueue: 'Aggiungi in coda', share: 'Condividi',
    saveIn: 'Salva in', findPlaylist: 'Trova una playlist', likedSongs: 'Brani che ti piacciono', noPlaylists: 'Nessuna playlist', cancel: 'Annulla', done: 'Fatto',
    addedToQueue: 'Aggiunto in coda', removedFromLiked: 'Rimosso dai brani che ti piacciono', addedTo: (p) => `Aggiunto a ${p}`, saved: 'Modifiche salvate',
    linkCopied: 'Link copiato negli appunti', failed: "Non è stato possibile completare l'operazione",
    saveToLiked: 'Salva nei brani che ti piacciono', savedToLiked: 'Aggiunto ai brani che ti piacciono', searchInPlaylist: 'Cerca nella playlist', clearSearch: 'Cancella ricerca',
    sortBy: 'Ordina per', sortKeys: { custom: 'Ordine personalizzato', title: 'Titolo', artist: 'Artista', album: 'Album', added: 'Data di aggiunta', duration: 'Durata' },
    noResults: (q) => `Nessun risultato per “${q}”`, loading: 'Caricamento…', partial: (n, t) => `Sono considerati i primi ${n} brani su ${t}`,
    viewAs: 'Visualizza come', compact: 'Compatta', list: 'Elenco', recentlyAdded: 'Aggiunti di recente',
    albumOrder: "Ordine dell'album",
    excludeFromTaste: "Escludi dal tuo profilo dei gusti",
    includeInTaste: "Includi nel tuo profilo dei gusti",
    excludedFromTaste: "Escluso dal tuo profilo dei gusti",
    includedInTaste: "Incluso nel tuo profilo dei gusti",
    songRadio: "Vai a radio del brano",
    viewCredits: "Visualizza riconoscimenti",
    openInDesktop: "Apri nell'app desktop",
    credits: "Riconoscimenti",
    close: "Chiudi",
    sources: "Fonte",
    filterTags: "Filtri per genere e atmosfera",
    clearFilter: "Cancella filtro",
  },
  en: {
    title: 'Title', album: 'Album', added: 'Date added', back: 'Go back', explicit: 'Explicit',
    play: (t) => `Play ${t}`, more: (t) => `More options for ${t}`, goToArtist: 'Go to artist', goToAlbum: 'Go to album', copyLink: 'Copy song link',
    addToPlaylist: 'Add to playlist', removeFromLiked: 'Remove from your Liked Songs', addToQueue: 'Add to queue', share: 'Share',
    saveIn: 'Save in', findPlaylist: 'Find a playlist', likedSongs: 'Liked Songs', noPlaylists: 'No playlists', cancel: 'Cancel', done: 'Done',
    addedToQueue: 'Added to queue', removedFromLiked: 'Removed from Liked Songs', addedTo: (p) => `Added to ${p}`, saved: 'Changes saved',
    linkCopied: 'Link copied to clipboard', failed: 'Something went wrong',
    saveToLiked: 'Save to your Liked Songs', savedToLiked: 'Added to Liked Songs', searchInPlaylist: 'Search in playlist', clearSearch: 'Clear search',
    sortBy: 'Sort by', sortKeys: { custom: 'Custom order', title: 'Title', artist: 'Artist', album: 'Album', added: 'Date added', duration: 'Duration' },
    noResults: (q) => `No results found for “${q}”`, loading: 'Loading…', partial: (n, t) => `Only the first ${n} of ${t} songs are included`,
    viewAs: 'View as', compact: 'Compact', list: 'List', recentlyAdded: 'Recently added',
    albumOrder: 'Album order',
    excludeFromTaste: "Exclude from your taste profile",
    includeInTaste: "Include in your taste profile",
    excludedFromTaste: "Excluded from your taste profile",
    includedInTaste: "Included in your taste profile",
    songRadio: "Go to song radio",
    viewCredits: "View credits",
    openInDesktop: "Open in Desktop app",
    credits: "Credits",
    close: "Close",
    sources: "Source",
    filterTags: "Genre and mood filters",
    clearFilter: "Clear filter",
  },
  es: {
    title: 'Título', album: 'Álbum', added: 'Fecha en que se añadió', back: 'Atrás', explicit: 'Explícito',
    play: (t) => `Reproducir ${t}`, more: (t) => `Más opciones para ${t}`, goToArtist: 'Ir al artista', goToAlbum: 'Ir al álbum', copyLink: 'Copiar enlace de la canción',
    addToPlaylist: 'Añadir a la playlist', removeFromLiked: 'Quitar de tus canciones que te gustan', addToQueue: 'Añadir a la cola', share: 'Compartir',
    saveIn: 'Guardar en', findPlaylist: 'Buscar una playlist', likedSongs: 'Canciones que te gustan', noPlaylists: 'No hay playlists', cancel: 'Cancelar', done: 'Listo',
    addedToQueue: 'Añadida a la cola', removedFromLiked: 'Quitada de Canciones que te gustan', addedTo: (p) => `Añadida a ${p}`, saved: 'Cambios guardados',
    linkCopied: 'Enlace copiado al portapapeles', failed: 'Se ha producido un error',
    saveToLiked: 'Guardar en tus canciones que te gustan', savedToLiked: 'Añadida a Canciones que te gustan', searchInPlaylist: 'Buscar en la playlist', clearSearch: 'Borrar búsqueda',
    sortBy: 'Ordenar por', sortKeys: { custom: 'Orden personalizado', title: 'Título', artist: 'Artista', album: 'Álbum', added: 'Fecha en que se añadió', duration: 'Duración' },
    noResults: (q) => `No hay resultados para “${q}”`, loading: 'Cargando…', partial: (n, t) => `Solo se incluyen las primeras ${n} de ${t} canciones`,
    viewAs: 'Ver como', compact: 'Compacta', list: 'Lista', recentlyAdded: 'Añadidas recientemente',
    albumOrder: 'Orden del álbum',
    excludeFromTaste: "Excluir de tu perfil de gustos",
    includeInTaste: "Incluir en tu perfil de gustos",
    excludedFromTaste: "Excluida de tu perfil de gustos",
    includedInTaste: "Incluida en tu perfil de gustos",
    songRadio: "Ir a radio de la canción",
    viewCredits: "Ver créditos",
    openInDesktop: "Abrir en la app de escritorio",
    credits: "Créditos",
    close: "Cerrar",
    sources: "Fuente",
    filterTags: "Filtros por género y estado de ánimo",
    clearFilter: "Borrar filtro",
  },
  fr: {
    title: 'Titre', album: 'Album', added: 'Date d’ajout', back: 'Retour', explicit: 'Explicite',
    play: (t) => `Lire ${t}`, more: (t) => `Plus d’options pour ${t}`, goToArtist: 'Accéder à l’artiste', goToAlbum: 'Accéder à l’album', copyLink: 'Copier le lien du titre',
    addToPlaylist: 'Ajouter à la playlist', removeFromLiked: 'Retirer des Titres likés', addToQueue: 'Ajouter à la file d’attente', share: 'Partager',
    saveIn: 'Enregistrer dans', findPlaylist: 'Rechercher une playlist', likedSongs: 'Titres likés', noPlaylists: 'Aucune playlist', cancel: 'Annuler', done: 'OK',
    addedToQueue: 'Ajouté à la file d’attente', removedFromLiked: 'Retiré des Titres likés', addedTo: (p) => `Ajouté à ${p}`, saved: 'Modifications enregistrées',
    linkCopied: 'Lien copié dans le presse-papiers', failed: 'Une erreur s’est produite',
    saveToLiked: 'Enregistrer dans les Titres likés', savedToLiked: 'Ajouté aux Titres likés', searchInPlaylist: 'Rechercher dans la playlist', clearSearch: 'Effacer la recherche',
    sortBy: 'Trier par', sortKeys: { custom: 'Ordre personnalisé', title: 'Titre', artist: 'Artiste', album: 'Album', added: 'Date d’ajout', duration: 'Durée' },
    noResults: (q) => `Aucun résultat pour « ${q} »`, loading: 'Chargement…', partial: (n, t) => `Seuls les ${n} premiers titres sur ${t} sont pris en compte`,
    viewAs: 'Afficher en tant que', compact: 'Compact', list: 'Liste', recentlyAdded: 'Ajoutés récemment',
    albumOrder: 'Ordre de l’album',
    excludeFromTaste: "Exclure de votre profil de goûts",
    includeInTaste: "Inclure dans votre profil de goûts",
    excludedFromTaste: "Exclu de votre profil de goûts",
    includedInTaste: "Inclus dans votre profil de goûts",
    songRadio: "Accéder à la radio du titre",
    viewCredits: "Afficher les crédits",
    openInDesktop: "Ouvrir dans l’application de bureau",
    credits: "Crédits",
    close: "Fermer",
    sources: "Source",
    filterTags: "Filtres par genre et ambiance",
    clearFilter: "Effacer le filtre",
  },
  de: {
    title: 'Titel', album: 'Album', added: 'Hinzugefügt am', back: 'Zurück', explicit: 'Explizit',
    play: (t) => `${t} abspielen`, more: (t) => `Weitere Optionen für ${t}`, goToArtist: 'Zum Künstler', goToAlbum: 'Zum Album', copyLink: 'Songlink kopieren',
    addToPlaylist: 'Zur Playlist hinzufügen', removeFromLiked: 'Aus Lieblingssongs entfernen', addToQueue: 'Zur Warteschlange hinzufügen', share: 'Teilen',
    saveIn: 'Speichern in', findPlaylist: 'Playlist suchen', likedSongs: 'Lieblingssongs', noPlaylists: 'Keine Playlists', cancel: 'Abbrechen', done: 'Fertig',
    addedToQueue: 'Zur Warteschlange hinzugefügt', removedFromLiked: 'Aus Lieblingssongs entfernt', addedTo: (p) => `Zu ${p} hinzugefügt`, saved: 'Änderungen gespeichert',
    linkCopied: 'Link in die Zwischenablage kopiert', failed: 'Etwas ist schiefgelaufen',
    saveToLiked: 'In Lieblingssongs speichern', savedToLiked: 'Zu Lieblingssongs hinzugefügt', searchInPlaylist: 'In Playlist suchen', clearSearch: 'Suche löschen',
    sortBy: 'Sortieren nach', sortKeys: { custom: 'Benutzerdefinierte Reihenfolge', title: 'Titel', artist: 'Künstler', album: 'Album', added: 'Hinzugefügt am', duration: 'Dauer' },
    noResults: (q) => `Keine Ergebnisse für „${q}“`, loading: 'Wird geladen …', partial: (n, t) => `Nur die ersten ${n} von ${t} Songs werden berücksichtigt`,
    viewAs: 'Anzeigen als', compact: 'Kompakt', list: 'Liste', recentlyAdded: 'Zuletzt hinzugefügt',
    albumOrder: 'Albumreihenfolge',
    excludeFromTaste: "Aus deinem Geschmacksprofil ausschließen",
    includeInTaste: "In dein Geschmacksprofil aufnehmen",
    excludedFromTaste: "Aus deinem Geschmacksprofil ausgeschlossen",
    includedInTaste: "In dein Geschmacksprofil aufgenommen",
    songRadio: "Zum Song-Radio",
    viewCredits: "Credits anzeigen",
    openInDesktop: "In der Desktop-App öffnen",
    credits: "Credits",
    close: "Schließen",
    sources: "Quelle",
    filterTags: "Genre- und Stimmungsfilter",
    clearFilter: "Filter löschen",
  },
  pt: {
    title: 'Título', album: 'Álbum', added: 'Adicionada em', back: 'Voltar', explicit: 'Explícito',
    play: (t) => `Tocar ${t}`, more: (t) => `Mais opções para ${t}`, goToArtist: 'Ir para o artista', goToAlbum: 'Ir para o álbum', copyLink: 'Copiar link da música',
    addToPlaylist: 'Adicionar à playlist', removeFromLiked: 'Remover das Músicas Curtidas', addToQueue: 'Adicionar à fila', share: 'Compartilhar',
    saveIn: 'Salvar em', findPlaylist: 'Encontrar uma playlist', likedSongs: 'Músicas Curtidas', noPlaylists: 'Nenhuma playlist', cancel: 'Cancelar', done: 'Concluir',
    addedToQueue: 'Adicionada à fila', removedFromLiked: 'Removida das Músicas Curtidas', addedTo: (p) => `Adicionada a ${p}`, saved: 'Alterações salvas',
    linkCopied: 'Link copiado para a área de transferência', failed: 'Algo deu errado',
    saveToLiked: 'Salvar nas Músicas Curtidas', savedToLiked: 'Adicionada às Músicas Curtidas', searchInPlaylist: 'Buscar na playlist', clearSearch: 'Limpar busca',
    sortBy: 'Ordenar por', sortKeys: { custom: 'Ordem personalizada', title: 'Título', artist: 'Artista', album: 'Álbum', added: 'Data de adição', duration: 'Duração' },
    noResults: (q) => `Nenhum resultado para “${q}”`, loading: 'Carregando…', partial: (n, t) => `Apenas as primeiras ${n} de ${t} músicas são consideradas`,
    viewAs: 'Ver como', compact: 'Compacto', list: 'Lista', recentlyAdded: 'Adicionadas recentemente',
    albumOrder: 'Ordem do álbum',
    excludeFromTaste: "Excluir do seu perfil de gosto",
    includeInTaste: "Incluir no seu perfil de gosto",
    excludedFromTaste: "Excluída do seu perfil de gosto",
    includedInTaste: "Incluída no seu perfil de gosto",
    songRadio: "Ir para a rádio da música",
    viewCredits: "Ver créditos",
    openInDesktop: "Abrir no app para computador",
    credits: "Créditos",
    close: "Fechar",
    sources: "Fonte",
    filterTags: "Filtros por gênero e clima",
    clearFilter: "Limpar filtro",
  },
};

export function viewLabels(lang = pageLanguage()): ViewLabels {
  const base = lang.toLowerCase().split('-')[0] ?? 'en';
  return VIEW_LABELS[base] ?? VIEW_LABELS['en']!;
}

const MONTH_MS = 30 * 24 * 3600_000;

/** Like the desktop "Date added" column: relative for the last month, then a short date. */
export function addedDate(timestamp: number, now: number, lang = pageLanguage()): string {
  // Rows without a date (0) would read as 1 January 1970.
  if (!(timestamp > 0)) return '';
  if (now - timestamp < MONTH_MS) return relativeTime(timestamp, now, lang);
  return cached(dateFormats, lang, (tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' })).format(timestamp);
}

/** 394653 → "6:34". */
const TOTAL_UNITS: Record<string, { hour: (h: number) => string; min: string; sec: string }> = {
  it: { hour: (h) => (h === 1 ? 'ora' : 'ore'), min: 'min', sec: 'sec' },
  en: { hour: () => 'hr', min: 'min', sec: 'sec' },
  es: { hour: () => 'h', min: 'min', sec: 's' },
  fr: { hour: () => 'h', min: 'min', sec: 's' },
  de: { hour: () => 'Std.', min: 'Min.', sec: 'Sek.' },
  pt: { hour: () => 'h', min: 'min', sec: 's' },
};

/** Total length of a list, as the desktop app's header shows it ("5 ore 1 min", "52 min 30 sec"). */
export function totalDurationText(ms: number, lang = pageLanguage()): string {
  const units = TOTAL_UNITS[lang.toLowerCase().split('-')[0] ?? 'en'] ?? TOTAL_UNITS['en']!;
  const seconds = Math.round(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${formatCount(hours, lang)} ${units.hour(hours)} ${minutes} ${units.min}`;
  return `${minutes} ${units.min} ${seconds % 60} ${units.sec}`;
}

export function formatDuration(ms: number): string {
  if (!(ms > 0)) return '';
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
