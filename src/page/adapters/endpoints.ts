// URL patterns of Spotify internal endpoints, verified on live traffic in Phase 0
// (docs/phase0-findings.md): the player uses POST /pathfinder/v2/query.

const PATHFINDER_HOST = 'api-partner.spotify.com';
/** Endpoint used for our own (fallback) queries, the same the player uses. */
export const PATHFINDER_V2_URL = 'https://api-partner.spotify.com/pathfinder/v2/query';
/**
 * Status of a query with an unknown persisted query hash: HTTP 412, body `"Invalid query hash"`
 * (checked live on 2026-10-29), not a GraphQL `PersistedQueryNotFound` error.
 */
export const INVALID_HASH_STATUS = 412;
const PATHFINDER_PATH = /^\/pathfinder\/v(\d+)\/query$/;
const SPCLIENT_HOST = /(^|[.-])spclient\.(wg\.)?spotify\.com$/;

export type EndpointKind = 'pathfinder' | 'spclient';

export interface EndpointMatch {
  kind: EndpointKind;
  /** Pathfinder major version (1, 2, ...), null for spclient. */
  pathfinderVersion: number | null;
}

export function matchEndpoint(rawUrl: string, base?: string): EndpointMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  if (url.hostname === PATHFINDER_HOST) {
    const version = PATHFINDER_PATH.exec(url.pathname)?.[1];
    return version ? { kind: 'pathfinder', pathfinderVersion: Number(version) } : null;
  }
  if (SPCLIENT_HOST.test(url.hostname)) {
    return { kind: 'spclient', pathfinderVersion: null };
  }
  return null;
}
