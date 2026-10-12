# Roadmap: desktop features missing from the web player

Candidates after Phases 0–2 (2026-10-10). ✅ = checked on the live web player; the others need a check first.

## Feasible (information and UI)

1. **Search and sort in Liked Songs and playlists.** ✅ On the web, neither Liked Songs nor regular playlists have a "search in playlist" field or a sort menu: the action bar only offers "Visualizza come" (compact / list), and the column headers have `aria-sort="none"` without buttons (checked on 2026-10-10). The desktop app has both. **Done** (`features/playlist-tools`): search box and one "sort by / view as" button in the action bar; our list replaces the native one only while searching or sorting.
2. ~~Play counts on the track page and in the "now playing" bar.~~ Dropped: the desktop app has no track page (user check, 2026-10-12).
3. **Sort album track lists by plays.** Not in the desktop app either, but useful. **Done** (`features/playlist-tools`, albums): the playlist controls on album pages, with "Plays" among the orders; missing pages come from `queryAlbumTracks` (up to 300 per request).
4. **The menu entries left out of our lists.** **Done** for the four entries of the web player's own track menu (checked on 2026-10-12): Exclude from / Include in your taste profile, Go to song radio, View credits, Open in Desktop app; in every list of ours (`library/trackActions`, `ui/creditsDialog`). The sleep timer is not a track menu entry on the web player and stays out.
5. **Extended credits** (engineers, mixers, session musicians). Check whether the credits endpoint returns them to the web session.
6. **"Lossless" label, information only.** Only if the metadata reachable from the web exposes the audio file formats (`FLAC_FLAC`, `FLAC_FLAC_24BIT`). Playback quality is never changed.

7. **Genre and mood filter chips under the action bar** (desktop Liked Songs and playlists: "Emo", "Rock", "Upbeat", "Chill"…). The web player's bundle has no operation for them (checked on 2026-10-10), so the desktop's data source must be found first; moods cannot be derived from data we already have.

## To evaluate carefully

- **SongDNA / "About the song":** Premium features on mobile today. Showing them to free accounts would unlock Premium features, which is excluded.
- **Settings missing on the web** (e.g. volume normalization): case by case, without touching the audio stream.

## Out of scope

Lossless playback, local files, offline downloads, equalizer, crossfade, gapless, Smart Shuffle, AI DJ: they need the native audio engine or are excluded by principle.

## Known limits

- After a library change made from our views, the player's own green ticks on album rows update only after a reload (the player's curation cache, see `phase2-findings.md`).
