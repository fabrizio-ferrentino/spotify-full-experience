# Chrome Web Store listing

Text to paste into the Developer Dashboard. Images are in this folder.

## Package

`npm run package` → upload `release/full-experience-for-spotify-chrome-<version>.zip`.

## Store listing

**Name** (from the manifest): Full Experience for Spotify

**Summary** (from the manifest, 132 characters max): Desktop app features in the Spotify web player: play counts, liked songs by artist, playlist search and sort. Unofficial.

**Category:** Entertainment

**Language:** English

**Description:**

```
The Spotify web player lacks a few things the desktop app has. This extension adds them to open.spotify.com.

PLAY COUNTS ON ALBUM PAGES
A "Plays" column next to each song, as in the desktop app, formatted for your language. Sort an album by plays to find its most played songs.

GENRE AND MOOD FILTERS IN LIKED SONGS
Chips under the Liked Songs action bar, like the desktop app's: pick a genre or a mood (Rock, Chill, Nostalgia…) to see only those songs, with their count and length.

LIKED SONGS ON ARTIST PAGES
How many of the artist's songs you liked, and their list. Double click to play a song.

SEARCH AND SORT IN PLAYLISTS AND ALBUMS
Search inside a playlist, an album or Liked Songs, and sort by title, artist, album, date added or duration.

THE FULL SONG MENU
In every list of the extension, the "…" menu has the player's entries: add to playlist, save or remove from Liked Songs, add to queue, exclude from your taste profile, go to song radio, go to artist or album, view credits, share, open in the desktop app.

SETTINGS
Click the extension icon to turn each feature on or off, or the whole extension at once. English and Italian.

PRIVACY
No server, no analytics, no tracking. The extension reads what the web player already receives and only talks to Spotify. Your liked songs index and their genres stay in your browser. Play and library actions run only when you click them.

It never touches audio, DRM or ads, and does not unlock Premium features.

Open source (MIT): https://github.com/fabrizio-ferrentino/spotify-full-experience

Unofficial project, not affiliated with, endorsed by or sponsored by Spotify. "Spotify" is a trademark of Spotify AB.
```

**Images:**

- Store icon: `assets/icons/icon-128.png`
- Screenshots (1280×800): `screenshot-1.png` … `screenshot-5.png`
- Small promo tile (440×280): `promo-small-440x280.png`

**Homepage URL:** https://github.com/fabrizio-ferrentino/spotify-full-experience

**Support URL:** https://github.com/fabrizio-ferrentino/spotify-full-experience/issues

## Privacy practices

**Single purpose:**

```
Adds features of the Spotify desktop app to the Spotify web player (open.spotify.com): play counts on album pages, genre and mood filters in Liked Songs, liked songs on artist pages, search and sort in playlists and albums, and the full song menu.
```

**Permission justification, storage:**

```
Saves the user's settings and a local index of their liked songs, used to show how many of an artist's songs they liked. Nothing leaves the browser.
```

**Host permission justification (content script on https://open.spotify.com/*):**

```
The extension only works on the Spotify web player: it adds columns, sections and controls to its pages and reads the responses the player already receives. It runs on no other site.
```

**Remote code:** No, I am not using remote code. All code is in the package.

**Data usage:** tick **Website content** (the extension reads songs, playlists and liked songs from Spotify pages and keeps a liked songs index, with their genres, in local storage). Leave the other categories unticked: it collects no personal identifiers, location, browsing history or credentials, and sends nothing to the developer.

Then tick the three certifications (no sale of data, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL:** https://github.com/fabrizio-ferrentino/spotify-full-experience/blob/main/PRIVACY.md

## Distribution

Visibility: Public (or Unlisted to test the review first). Regions: all.
