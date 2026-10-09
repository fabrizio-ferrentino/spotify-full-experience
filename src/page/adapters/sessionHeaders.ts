// Request headers the player sends to Pathfinder that our own queries must repeat.
// Names observed in Phase 0 (fixtures' requestHeaderNames). Values are kept in memory only:
// never logged, never stored, never sent on the bridge (CLAUDE.md §2.3).
export const SESSION_HEADER_NAMES: readonly string[] = [
  'authorization',
  'client-token',
  'app-platform',
  'spotify-app-version',
  'accept-language',
];

export const AUTHORIZATION_HEADER = 'authorization';
export const APP_VERSION_HEADER = 'spotify-app-version';
