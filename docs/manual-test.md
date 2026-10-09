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
- Open the **SFE** panel (bottom right), find the request and click **Export**. Move the downloaded file into `test/fixtures/`, **open it and review it**, then run `npm test` (the fixtures safety test must pass).

If the coverage line turns into a warning (`seen` much higher than `captured`), some requests bypass our wrappers: note on which page it happens.
