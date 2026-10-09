// Patterns that must never appear in a committed fixture (public repo, CLAUDE.md §2.9).
// Used by the fixture exporter (final check) and by the fixtures-safety unit test.

export const SENSITIVE_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'bearer token', pattern: /Bearer\s/i },
  { name: 'sp_dc cookie', pattern: /sp_dc/i },
  { name: 'sp_key cookie', pattern: /sp_key/i },
  { name: 'user URI', pattern: /spotify:user:/i },
  { name: 'user URL', pattern: /\/user\/(?!<redacted>)[^\s"/?#<]+/i },
  { name: 'share tracking id', pattern: /[?&]si=(?!<redacted>)[^&#\s"]+/ },
  { name: 'email address', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'JWT', pattern: /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/ },
];

/** Names of the sensitive patterns found in `text` (never the matches themselves). */
export function findSensitivePatterns(text: string): string[] {
  return SENSITIVE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}
