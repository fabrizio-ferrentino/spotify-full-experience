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
