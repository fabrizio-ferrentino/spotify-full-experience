# Manual test checklist

Run on **Chrome**, **Brave** and **Firefox**. Brave is not officially supported by Spotify: if something fails only there, retry on Chrome before treating it as our bug.

## Setup

1. `npm run build`
2. Load the extension:
   - Chrome / Brave: `chrome://extensions` → Developer mode → "Load unpacked" → `dist/chrome`.
   - Firefox: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → `dist/firefox/manifest.json`. In `about:addons`, allow the extension on `open.spotify.com`.
3. Open the extension options and enable **Debug mode**.
4. Open `https://open.spotify.com`, then the DevTools console. Debug lines start with a green `[SFE]`.

## Smoke test (every release)

- [ ] The startup line `[SFE] page script active …` appears.
- [ ] No `[SFE]` warning about `window.fetch` or `console` being already wrapped.
- [ ] With debug **off**, the console shows no `[SFE]` line and the page behaves as without the extension.
- [ ] Playback, hover play button, context menu, keyboard navigation and likes work as without the extension.
- [ ] No new errors in the console compared with the extension disabled.

## Play counts (Phase 1)

Run with the "Play counts on album pages" option enabled.

- [ ] Album page: a "Riproduzioni" / "Plays" column between title and duration, numbers in the page locale (`2.441.116` in Italian), aligned with the duration column.
- [ ] Numbers match the desktop app on 3 albums.
- [ ] Album with more than 50 tracks: scroll to the end, every row has a number (later pages come from `queryAlbumTracks`).
- [ ] SPA navigation album → album → artist → playlist → album: column only on albums, no duplicates, no number on the wrong row.
- [ ] Artist page: no extra column (the player already shows play counts in "Popular").
- [ ] Hover play button, double-click play, context menu, click and shift-click selection, arrow keys work as without the extension.
- [ ] Narrow the window (or open the "Now playing" panel): below ~560 px of list width the column disappears.
- [ ] Option disabled (reload the tab): album pages identical to the original.
- [ ] No new errors in the console.

## Liked songs on artist pages (Phase 2)

Run with the "Liked songs on artist pages" option enabled. Keep Spotify open in one tab only: with another device active, the player does not start playback in this tab.

- [ ] Artist page: a "Cosa ti è piaciuto" / "Liked songs" section under Popular, with the artist picture, heart badge, "N brani" and "Di <artist>"; only when N > 0.
- [ ] N matches the desktop app on 3 artists, at least one with collaborations (only the primary artist counts).
- [ ] First visit: the index is built with 2 requests for ~1200 liked songs, no 429.
- [ ] Click the section: the "Brani che ti piacciono di <artist>" view covers the main view; back button, Escape and any navigation restore the artist page.
- [ ] Rows: hover shows "…"; click selects; double click plays the track and continues with the artist's liked songs; title, artists and album open their pages; right click opens the same menu as "…".
- [ ] Like a track of the artist elsewhere, come back: the count goes up. Unlike it: the count goes down.
- [ ] Option disabled (reload the tab): no section, artist page identical to the original.

## Phase 0 reconnaissance

Navigate **inside the app** (click links) rather than reloading a URL: requests issued before the page script starts cannot be captured.

On each page change the console shows a `──── page: … ────` separator, a coverage line, the captured requests (collapsed groups) and, after the page settles, a `DOM probe` group.

| Step | What to do | What to look for |
|---|---|---|
| 1 | Open an album | Operation that loads the album; is there a play count per track? |
| 2 | Open an artist page | Operation that loads "Popular"; play counts? |
| 3 | Open a track page | Operation(s) and fields available |
| 4 | Open "Liked Songs" and scroll down | Library operation, pagination variables, `totalCount`, `addedAt`, where the artists are |
| 5 | Like a track, then remove the like | Operations for add / remove |
| 6 | (Optional) Try the desktop route for "Liked songs by artist" | Does the web player resolve it? |

For each relevant request:

- Copy the collapsed group content (operation, hash, variable keys, header names, highlighted paths) into `docs/phase0-findings.md`.
- Open the **SFE** panel (bottom right), find the request and click **Export**.
- Pass the downloaded file through the sanitizer, which applies the current anonymization rules:
  `npm run fixture:sanitize -- --out test/fixtures/pathfinder [--max-items 3] [--redact <personal id>] <file>`.
  Use `--max-items` for personal lists (Liked Songs) and `--redact` for IDs the generic rules cannot recognise (the per-account Liked Songs playlist ID).
- **Open and review** the result, then run `npm test` (the fixtures safety test must pass).

If the coverage line turns into a warning (`seen` much higher than `captured`), some requests bypass our wrappers: note on which page it happens.
