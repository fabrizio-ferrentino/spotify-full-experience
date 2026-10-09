# Phase 0 findings

Observed on live traffic. Operation names, hashes and DOM change with player releases: always re-check against the bundle version below.

- Date: 2026-10-09
- Web player bundle: `web-player.c884aee7.js`, `vendor~web-player.9d1c96f6.js`
- Browsers checked: Chrome (full run), Brave and Firefox (injection only)
- Account type: free

## Injection and interception

| Browser | Page script start (ms) | readyState | Completed before injection | Coverage gaps |
|---|---|---|---|---|
| Chrome | 924–1094 | interactive | 0 / 0 | none (pathfinder 32/32, spclient 76/76) |
| Brave | 348 | loading | 0 / 0 | not measured |
| Firefox | 608 | interactive | 0 / 0 | not measured |

- The player uses **POST `/pathfinder/v2/query`** for almost every operation.
- One exception: a **POST `/pathfinder/v1/query`** without `operationName` in the body (hash `f952da03…`, variables `uris: array`, response `data.lookupEntities[]`). Body shape still to be checked on a fixture.
- On Chrome, plain `console.log` lines are attributed to `web-player.<hash>.js`: the player wraps `console.log` (likely error-reporting breadcrumbs) before page.js runs, and the wrapper hides itself from the `[native code]` check. `console.groupCollapsed` is not wrapped.

## 1. Album: play count per track ✅

- Operation: `getAlbum`
- Hash: `11c9cad9cb24c4f9e25ef9456f68621cfd6006a90f679e729c1d2f2fd70dfe16`
- Variable keys: `uri`, `locale`, `offset`, `limit` (values to read from a fixture)
- Play count: `$.data.albumUnion.tracksV2.items[].track.playcount` (string)
- Track URI: `$.data.albumUnion.tracksV2.items[].track.uri`; total: `$.data.albumUnion.tracksV2.totalCount`
- **Phase 1 can be passive** for albums whose tracks fit in the first page.

## 2. Artist: "Popular" section ✅

- Operation: `queryArtistOverview`
- Hash: `9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6`
- Variable keys: `uri`, `locale`, `preReleaseV2`
- Play count: `$.data.artistUnion.discography.topTracks.items[].track.playcount` (string)
- **The web player already shows play counts in "Popular"** (column 3, formatted, e.g. `81.714.207`). Nothing to add there.

## 3. Liked Songs: library pagination ✅ (limit to confirm)

- Page `/collection/tracks` loads it as a playlist: `fetchPlaylist` (first page with metadata) and `fetchPlaylistContents` (next pages).
- Hash (both): `8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a`
- Variable keys: `uri`, `offset`, `limit`, `includeEpisodeContentRatingsV2` (+ `enableWatchFeedEntrypoint` for `fetchPlaylist`). The `uri` value (a user collection URI) and the `limit` value are still to be read from a fixture.
- Maximum accepted limit: **unknown**
- Total: `$.data.playlistV2.content.totalCount`
- Added at: `$.data.playlistV2.content.items[].addedAt.isoString`
- Track URI: `$.data.playlistV2.content.items[].itemV2.data.uri`
- Artists: `$.data.playlistV2.content.items[].itemV2.data.artists.items[]` (`uri`, `profile.name`). Assumption to verify: the first item is the primary artist.
- Also present: `itemV2.data.playcount`, and `itemV3.data.identityTrait.contributors.items[].uri`.
- Sidebar library: `libraryV3` (hash `390c78e5…`) with `$.data.me.libraryV3.items[]` and `totalCount`; variables include `textFilter`, `limit`, `offset`.

## 4. Like / unlike (partial)

- From the user's manual run (remove then re-add a liked track): `applyCurations` then `addToLibrary`, each followed by `libraryV3` refetches.
- Probable: `applyCurations` = remove (via the "saved in" dialog), `addToLibrary` = add. To confirm by expanding those requests.
- Other library checks: `areEntitiesInLibrary` (hash `134337999…`, `uris: array`), `isCurated` (hash `e4ed1f91…`, `uris: array`).

## 5. DOM structure ✅

Same component on album and artist pages:

- Container: `div[role=grid][data-testid=track-list]` with `aria-colcount` and `aria-rowcount`, inside `div[data-testid=grid-container]`.
- Inline CSS custom properties on the container: `--grid-template-columns`, `--first-min-width`, `--var1-min-width` (artist only), `--last-min-width`, `--row-height`.
- Rows: `div[role=row][aria-rowindex=N]` → `div[data-testid=tracklist-row]` (CSS grid) → `div[role=gridcell][aria-colindex=1..n]`.
- Track link inside rows: `[data-testid=internal-track-link]` (`href=/intl-it/track/<id>`); last cell contains `[data-testid=more-button]` and the duration.
- Virtualised list: `top-sentinel` / `bottom-sentinel` and `tracklist-row-placeholder` elements.

**Album** (`aria-colcount=3`):

```
--grid-template-columns: [index] var(--index-column-width, 16px)
  [first] minmax(var(--first-min-width), var(--first-max-width, 4fr))
  [last]  minmax(var(--last-min-width), var(--last-max-width, 1fr))
```

Header row: `div[role=row][aria-rowindex=1]` (itself a grid with the same columns) with `div[role=columnheader][aria-colindex=1..3]`, each containing `[data-testid=column-header-context-menu]`.

**Artist "Popular"** (`aria-colcount=4`, no header row): the same template with an extra `[var1] minmax(var(--var1-min-width), var(--var1-max-width, 2fr))` column holding the play count, `--var1-min-width: 120px`.

➡ Strategy A looks feasible: on albums, reproduce the artist layout (add a `var1` column and set `--var1-min-width`) instead of inventing a new grid.

## 6. (Optional) "Liked songs by artist" route

- Not tested: needs the desktop route (Spicetify DevTools) first.

## Open questions

- `limit` values used by `getAlbum` and `fetchPlaylistContents`, and the maximum accepted limit.
- Confirm add/remove operations and their variables (`applyCurations`, `addToLibrary`; is there a `removeFromLibrary`?).
- Body shape of the `pathfinder/v1` request without `operationName`.
- Is `artists.items[0]` always the primary artist? (`getTrack` exposes `firstArtist` / `otherArtists` separately, which can be used as a cross-check.)
- Debug highlighting is noisy: `uri` also matches keys like `featuringV2`. Match whole keys instead of substrings.
