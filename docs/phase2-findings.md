# Phase 2 reconnaissance

Live checks on 2026-10-10, web player `1.3.5.316.gd873ee9db135` (Chrome, free account).
5 active queries in total, through the extension's rate-limited client (`sfeDebug`).

## Liked songs source: `fetchLibraryTracks` ✅

- Hash (found in the player bundle, confirmed by a live query): `087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240`.
- Variables: `{ offset, limit }`. No personal playlist ID needed.
- Response:
  - `$.me.library.tracks.totalCount` (number), `$.me.library.tracks.pagingInfo { offset, limit }`
  - `$.me.library.tracks.items[].addedAt.isoString`
  - `$.me.library.tracks.items[].track._uri` (`spotify:track:<id>`)
  - `$.me.library.tracks.items[].track.data.artists.items[]` (`uri`, `profile.name`), plus `name`, `albumOfTrack { uri, name, coverArt, artists }`, `duration`, `playability`… No `playcount`.
- **Maximum limit: 1000 accepted** (1000 items, ~840 ms, ~1 MB). A 1220-track library takes 2 queries.

The Liked Songs *playlist* operations (`fetchPlaylist` / `fetchPlaylistContents`) need the per-account playlist URI: `spotify:collection:tracks` is rejected ("not of type [PLAYLIST, PLAYLIST_V2]"), and the ID only shows up in data reliably once the user opens Liked Songs (sometimes also in a home shortcut). Not used.

## Primary artist ✅

For "Paper Thin" (`spotify:track:33LQdszht4rDfgmOSth8W0`), `artists.items` is ILLENIUM, Tom DeLonge, Angels & Airwaves, and `getTrack` gives `firstArtist` = ILLENIUM, `otherArtists` = the other two. **The first item of `artists.items` is the primary artist.**

## User identity for the per-user index key

`profileAttributes` (called by the player at every start, variables `{}`) returns `$.me.profile.uri` (`spotify:user:<id>`), `username`, `accountId`, `name`, `avatar`. The index key is a SHA-256 of the profile URI, never the URI itself.

## Hashes

- Bundle extraction works: for every operation checked, the hash found after the operation name in the player's bundles equals the one in the live traffic.
- `queryAlbumTracks` (checked on 2026-10-12): variables `{ uri, offset, limit }`, `limit` up to at least 300 (a 92-track album came back whole); the response is `albumUnion { tracksV2 { totalCount, items[] { uid, track } } }`, the same items as `getAlbum` (with `playcount`, `discNumber`, `trackNumber`) but without the album name or cover.
- One hash can serve several operations of the same document: `getAlbum` / `queryAlbumTracks`, `fetchPlaylist` / `fetchPlaylistContents` / `fetchPlaylistMetadata`.

## Session

- Scripts that patch `window.fetch` after load never see the player's Pathfinder requests: the player keeps the reference it took at startup (our MAIN-world wrapper). Early injection is required for session headers.

## Artist page, "Popular" block

`main … [data-testid=grid-container] > div` contains `h2` ("Popolari"), a `div` with the `track-list`, and the "Altro" button. The liked songs card goes right after this block.

## SPA navigation ✅

`history.pushState(state, '', path)` followed by a `popstate` event navigates inside the app without reloading (checked with `/collection/tracks`).

## Click strategies

- **Strategy 1 (native filter): not available.** The web player's Liked Songs page has no "search in playlist" field and no sort menu: the action bar only has play, Smart Shuffle, download and "Visualizza come" (compact/list).
- **Strategy 2 (desktop route): not available.** `/collection/artist/<artistId>` is recognised but redirects to the full `/collection/tracks`.

## Playback from our view

- In the web player, opening a track page plays it: the router adds `?autoplay_ok=1` (also for the player's own title links), but only when this tab is the active Connect device.
- A double click on a native row sends a Connect command: `POST https://<spclient host>/connect-state/v1/player/command/from/<device>/to/<device>` with `{ command: { endpoint: "play", context: { uri, url: "context://<uri>" }, play_origin, options: { license, skip_to: { track_uri } }, logging_params } }`. "Add to queue" is the same command with `endpoint: "add_to_queue"`, preceded by a `connect/transfer` when another device is active.
- Our double click sends the same `play` command (CLAUDE.md §2.10) with the desktop's context `spotify:user:<id>:collection:artist:<artistId>`, then the liked songs, then falls back to the track page. Works on Chrome, Brave and Firefox when the tab is the active device.

## Track menu entries (checked on 2026-10-12)

The web player's track menu (Liked Songs row): Add to playlist, Remove from your Liked Songs, Add to queue, Exclude from your taste profile, Go to song radio, Go to artist, Go to album, View credits, Share, Open in Desktop app.

- **Go to song radio:** `GET https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/spotify:track:<id>?response-format=json` → `{ mediaItems[] { uri: spotify:playlist:<id> }, total }`; the player then opens that playlist.
- **View credits:** Pathfinder `queryTrackCreditsGroupedModal`, variables `{ trackUri, contributorsLimit: 100, contributorsOffset: 0 }` (values from the player's dialog code, `xpui-root-dialogs` chunk; hash `f135fb9b…`). Response: `trackUnion { name, artists, creditsTrait { contributors.items[] { name, role, roleGroup.name, uri, url }, sources.items[].name } }`.
- **Exclude from / Include in your taste profile:** `POST https://spclient.wg.spotify.com/collection/v2/write?market=from_token`, JSON body `{ username, set: "ignoreinrecs", items: [{ uri }] }`; including again adds `is_removed: true` to the item. The menu label comes from `POST …/collection/v2/contains?market=from_token` with the same body, answered `{ found: [boolean] }`. Checked by excluding a song and including it again.
- **Open in Desktop app:** the `spotify:track:<id>` link.

## Row actions in our view (desktop parity)

- **Playlists for "Save in" / "Add to playlist":** `editablePlaylists` (hash `d5c4b809…`), variables `{ offset, limit, textFilter, uris: [trackUri] }`. `me.editablePlaylists { totalCount, items[] { curates, pinned, item { _uri, data { __typename, name, uri, image | images } } } }`. The first item is the liked songs (`PseudoPlaylist`, `spotify:collection:tracks`); `curates` says whether the track is already there.
- **Save / remove:** `applyCurations` with `{ input: { curations: [{ contextUri, curationType: CURATE | UNCURATE }], itemUris } }`, the same mutation the player's dialog sends (its bundle also has `applyCurationsV2`, used for some contexts).
- **Add to queue:** in the player's bundle, a single track goes through `add_to_queue` with `{ track: { uri, metadata: { is_queued: "true" } } }` and is sent to the **active** device (`_lastActiveDevice`), not necessarily the local one. Our command first reads `GET /connect-state/v1/cluster` (the same read the player does) and targets its `active_device_id`; with nothing playing, nothing is sent.
- **Known limit, liked/saved marks in the player's pages:** the player keeps the "saved" state (`isCurated`, the green tick on rows) in a client cache that only its own library and playlist operations update; server events (`hm://collection/…`) update the liked songs set but not that cache. After a change made from our view (or from another device), the tick on album rows stays until the page is reloaded.
- **Device ID of this tab:** the player's own commands carry it (`from/<device>`); before any command, it comes from the playback device requests `/track-playback/v1/devices/<device>/(volume|state)` (sent at startup). The Connect observer registration `/connect-state/v1/devices/hobs_<…>` is NOT usable: the player cuts `hobs_<device>` to 40 characters, so it carries a truncated ID (35 vs 40 characters, checked live). Using it made the first commands after a page load fail.
