<p align="center"><img src="assets/icons/icon-128.png" width="96" alt=""></p>

<h1 align="center">Spotify Full Experience</h1>

<p align="center">Brings to the Spotify web player a few things that only the desktop app has.<br>Chrome, Brave, Edge and Firefox.</p>

> **Unofficial.** A personal-use project, not affiliated with, endorsed by or sponsored by Spotify. "Spotify" is a trademark of Spotify AB. It relies on undocumented internals of the web player, which may change at any time.

## Features

Screenshots of the web player in Italian. Personal data is blurred.

### Play counts on album pages

| Before | After |
| --- | --- |
| ![Album page without play counts](docs/images/album-before.jpg) | ![Album page with a play count column](docs/images/album-after.jpg) |

### Liked songs on artist pages

How many of the artist's songs you liked (as primary artist, like the desktop app), and their list.

| Before | After |
| --- | --- |
| ![Artist page without liked songs](docs/images/artist-before.jpg) | ![Artist page with a liked songs section](docs/images/artist-after.jpg) |

The list plays on double click and has the desktop's row menu: add to playlist, remove from liked songs, add to queue, go to artist or album, share.

![Liked songs of an artist, with the row menu](docs/images/liked-by-artist.jpg)

### Search and sort in playlists

Search in a playlist or in Liked Songs, and sort by title, artist, album, date added or duration.

| Before | After |
| --- | --- |
| ![Playlist without search](docs/images/playlist-before.jpg) | ![Playlist searched for "love"](docs/images/playlist-search.jpg) |

### Settings

<img src="docs/images/popup.png" width="320" align="right" alt="Settings popup">

Click the extension icon: one switch turns the whole extension off, and each feature has its own. Changes apply at once.

The popup also links to the source code and to the issue tracker.

<br clear="right">

## Install

Not on the stores yet. Build it and load it unpacked (Node.js 20+):

```sh
npm install
npm run build
```

- **Chrome / Brave / Edge:** `chrome://extensions` → Developer mode → "Load unpacked" → `dist/chrome`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → `dist/firefox/manifest.json` (removed when Firefox restarts).

## Privacy

- Reads what the web player already receives. When it needs more, it asks Spotify with the player's own session, rate limited.
- No backend, no telemetry, no other domains. Tokens stay in memory and are never stored.
- Never touches audio, DRM or ads, and never unlocks Premium features.
- Playback and library actions (play, queue, playlists, likes) run only when you click them.

## Development

```sh
npm run watch       # rebuild on change
npm test
npm run typecheck
```

Found a bug? [Open an issue](https://github.com/fabrizio-ferrentino/spotify-full-experience/issues/new).

## Like it?

If it is useful to you, a star helps other people find it.

[![GitHub stars](https://img.shields.io/github/stars/fabrizio-ferrentino/spotify-full-experience?style=social)](https://github.com/fabrizio-ferrentino/spotify-full-experience/stargazers)

## License

[MIT](LICENSE)
