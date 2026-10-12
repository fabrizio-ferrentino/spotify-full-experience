# Manual test checklist

Run on **Chrome**, **Brave** and **Firefox**. Brave is not officially supported by Spotify: if something fails only there, retry on Chrome before treating it as our bug.

## Setup

1. `npm run build`
2. Load the extension:
   - Chrome / Brave: `chrome://extensions` → Developer mode → "Load unpacked" → `dist/chrome`.
   - Firefox: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → `dist/firefox/manifest.json`. In `about:addons`, allow the extension on `open.spotify.com`.
3. Click the extension icon in the toolbar and enable **Debug mode** (under Advanced).
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
- [ ] Rows: hover shows ▶ in place of the number, the green tick and "…"; click selects; double click or ▶ plays the track and continues with the artist's liked songs; the big green button plays from the first one; title, artists and album open their pages.
- [ ] Right after a page load (no native command yet), "…" → "Aggiungi in coda" and a double click work at the first try.
- [ ] "…" / right click: Aggiungi alla playlist ▸ (search, playlists), Rimuovi dai brani che ti piacciono (the row disappears, the count goes down), Aggiungi in coda (added to the queue of the device that is playing, also another tab or browser), Vai all'artista, Vai all'album, Condividi ▸ Copia link. Every action shows a toast.
- [ ] Green tick → "Salva in": liked songs checked, playlists with their state; Annulla and Escape change nothing; Fatto sends only the changes.
- [ ] Known limit: after a change made from our view, the player's own ticks on album rows update only after a reload.
- [ ] Like a track of the artist elsewhere, come back: the count goes up. Unlike it: the count goes down.
- [ ] Option disabled (reload the tab): no section, artist page identical to the original.

## Search and sort in playlists

Run with the "Search and sort in playlists" option enabled.

- [ ] Playlist and Liked Songs pages: a magnifier and one "order ☰" button in the action bar; the player's "Elenco" button is hidden.
- [ ] Without searching or sorting, the list is the player's own (hover, play, menus, drag and drop as usual).
- [ ] Search: matches title, artists and album, ignoring case and accents; the matches are highlighted; × and Escape restore the native list.
- [ ] Sort menu: Liked Songs offer Titolo, Aggiunti di recente, Artista, Album; playlists offer Ordine personalizzato, Titolo, Artista, Album, Data di aggiunta, Durata. Choosing the same entry again flips the direction; headers of our list sort too.
- [ ] "Visualizza come" Compatta / Elenco from our menu switches the player's view.
- [ ] Double click in a filtered playlist plays from that track in the playlist context.
- [ ] Navigate playlist → playlist, Home → playlist, playlist → Liked Songs: the controls are always there, no leftovers on other pages.
- [ ] A playlist longer than 1000 songs loads with one extra request per 1000 songs, only when searching or sorting.
- [ ] Option disabled (reload the tab): playlist pages identical to the original.

## Sort albums by plays

Run with the "Search and sort in playlists and albums" option enabled.

- [ ] Album page: the magnifier and an "Album order ☰" button in the action bar; the player's "List" button is hidden; the native list (with our Plays column) is untouched.
- [ ] Sort menu: Album order, Plays, Title, Duration. Plays starts with the most played; choosing it again flips the order; songs without a count stay last.
- [ ] While sorted or searched, our list shows #, Title, Plays and duration, no covers; double click plays the song in the album context.
- [ ] Album with more than 50 songs (e.g. a deluxe edition): sorting by plays shows every song, with one extra request per 300 missing songs.
- [ ] Back to "Album order", or to another page: the native list comes back, nothing left behind.

## Genre and mood filters in Liked Songs

Run with the "Genre and mood filters in Liked Songs" option enabled.

- [ ] First visit to Liked Songs: after a few seconds (about one request per 50 songs) a row of chips appears between the action bar and the list, in the player's language; later visits show it at once.
- [ ] The row scrolls sideways; the arrows appear only when chips are hidden on that side.
- [ ] A chip shows only its songs (compare a few with the desktop app's same chip); the row keeps a ✕ and the chosen chip, white. Search and sort still work on the filtered songs.
- [ ] With a chip chosen the header reads the chip's count and length ("77 brani, 5 ore 1 min"), and goes back to the full count after ✕.
- [ ] ✕ (or the chosen chip again) brings back every chip and the player's own list.
- [ ] Like a new song, reload: its genres are asked (one request) and the chips include it.
- [ ] Option disabled: no chips, no requests.

## Row menu entries from the web player

In our lists (liked songs by artist; a searched or sorted playlist or album):

- [ ] The "…" menu and right click show, in this order: Add to playlist, Remove from / Save to Liked Songs, Add to queue, Exclude from your taste profile, Go to song radio, Go to artist, Go to album, View credits, Share, Open in Desktop app.
- [ ] Exclude, then open the menu again: it reads "Include in your taste profile"; the player's own menu agrees after a reload. Include again restores it.
- [ ] Go to song radio opens the song's radio playlist, without reloading the page.
- [ ] View credits opens a dialog with the role groups and the sources; artists link to their page; ×, Escape and a click outside close it.
- [ ] Open in Desktop app hands the song to the desktop app (the browser may ask first).

## Toolbar popup

- [ ] The toolbar shows the green "FE" icon; clicking it opens the popup with name, version and the switches, in the browser's language (Italian or English).
- [ ] The switches show the stored settings; changing one shows "Saved." and the open Spotify tab follows without a reload (debug excepted).
- [ ] Master switch off: the feature switches turn grey but keep their state; on the open Spotify tab the play counts, the liked songs section and the playlist controls disappear. Back on: they come back.
- [ ] Master switch off and reload the tab: the page is identical to the original.
- [ ] "Source code" opens the GitHub repository and "Report a problem" a new issue, each in a new tab.
- [ ] The extension's options page (`chrome://extensions` → Details → Extension options; `about:addons` on Firefox) shows the same panel.

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
