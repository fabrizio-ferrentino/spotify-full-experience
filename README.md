# Spotify Full Experience

A browser extension (Chromium and Firefox, Manifest V3) that adds to the Spotify web player (`open.spotify.com`) some information that the desktop app shows and the web player does not, such as per-track play counts and liked songs per artist.

> **Disclaimer.** This is an unofficial, personal-use project. It is **not affiliated with, endorsed by, or sponsored by Spotify**. "Spotify" is a trademark of Spotify AB. The extension relies on undocumented internal APIs of the web player that may change or disappear at any time.

## What it does not do

- It never touches audio playback, DRM or licensing.
- It never blocks, hides or alters ads, and never unlocks Premium features.
- It never creates its own tokens, has no backend and sends no telemetry. It only talks to the Spotify domains the web player already uses.

## Status

Early development (Phase 0: reconnaissance). There are no user-facing features yet.

## Build

Requires Node.js 20 or newer.

```sh
npm install
npm run build       # production build into dist/chrome and dist/firefox
npm run build:dev   # same, with inline source maps
npm run watch       # rebuild on change
npm test
npm run typecheck
```

## Load the extension

- **Chrome / Brave / Edge:** open `chrome://extensions`, enable Developer mode, click "Load unpacked" and select `dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and select `dist/firefox/manifest.json`. The add-on is removed when Firefox restarts. In `about:addons`, make sure the extension is allowed to run on `open.spotify.com`.

## License

[MIT](LICENSE)
