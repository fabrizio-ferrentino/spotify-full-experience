// Web player URL routes. Public URL structure of open.spotify.com, including the optional
// localized prefix (/intl-xx/). To be confirmed on live navigation (Phase 0).

export type PageKind = 'album' | 'artist' | 'track' | 'playlist' | 'collection' | 'other';

export interface PageInfo {
  kind: PageKind;
  id: string | null;
}

const ENTITY_ROUTE = /^(?:\/intl-[a-z]{2}(?:-[a-z]{2})?)?\/(album|artist|track|playlist)\/([A-Za-z0-9]+)\/?(?:$|\/)/i;
const COLLECTION_ROUTE = /^(?:\/intl-[a-z]{2}(?:-[a-z]{2})?)?\/collection\/([a-z-]+)\/?$/i;

export function parseRoute(pathname: string): PageInfo {
  const entity = ENTITY_ROUTE.exec(pathname);
  if (entity?.[1] && entity[2]) return { kind: entity[1].toLowerCase() as PageKind, id: entity[2] };
  const collection = COLLECTION_ROUTE.exec(pathname);
  if (collection?.[1]) return { kind: 'collection', id: collection[1].toLowerCase() };
  return { kind: 'other', id: null };
}
