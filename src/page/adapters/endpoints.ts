// URL patterns of Spotify internal endpoints.
// Source: project research (CLAUDE.md §1), NOT yet verified on live traffic (Phase 0).

const PATHFINDER_HOST = 'api-partner.spotify.com';
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
