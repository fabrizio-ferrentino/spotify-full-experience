// In-app navigation: the player's router follows popstate, so pushState + popstate navigates
// without reloading (checked live, docs/phase2-findings.md).

export function navigateTo(path: string): void {
  history.pushState(history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
}

export function trackPath(trackId: string): string {
  return `/track/${trackId}`;
}

export function albumPath(albumId: string): string {
  return `/album/${albumId}`;
}

export function artistPath(artistId: string): string {
  return `/artist/${artistId}`;
}

/** Public share link of a track (the same URL the player copies). */
export function trackShareUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}
