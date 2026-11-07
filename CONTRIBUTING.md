# Contributing

Thanks for your interest. This is a personal project, so please open an issue before starting work on anything bigger than a small fix, so we can agree on the approach first.

## Build and test

Requires Node.js 20 or newer.

```sh
npm install
npm run watch       # rebuild on change
npm test
npm run typecheck
npm run package     # store zips in release/
```

Load `dist/chrome` as an unpacked extension in Chrome, Brave or Edge, and `dist/firefox/manifest.json` as a temporary add-on in Firefox.

## Testing changes

Changes must be verified on **Chrome, Firefox and Brave**. Brave is not officially supported by Spotify, so the same bug can look different across the three; testing on all of them is how we tell our bugs apart from the browser's.

Unit tests live in `test/unit/` and run against anonymized fixtures in `test/fixtures/`. There are no automated tests that log in to Spotify.

## Rules that are not negotiable

The repo is public, so what you commit is public too. Please:

- **Never commit tokens, cookies, user IDs, emails or raw HAR dumps.** Fixtures must pass through the anonymization script. A CI check fails on common patterns (`Bearer `, `sp_dc`, `spotify:user:`), but do not rely on it.
- **Do not touch audio, DRM, Widevine or ads.** No ad blocking, hiding or skipping. No unlocking of Premium features.
- **Never generate Spotify tokens.** Only reuse the token that flows through the player's session, and keep it in memory — never in storage, logs or `postMessage` traffic.
- **No new network destinations.** The extension only talks to the Spotify domains the player already uses. No backend, no telemetry.
- **Player and library actions (play, queue, like, playlist edits) run only on an explicit click.** No automation.
- **Anything Spotify-specific** (selectors, GraphQL operation names, JSON paths, known hashes) lives under `src/page/adapters/` only.
- **Fail-safe.** Any error turns the feature off silently; Spotify must keep working exactly as without the extension.

## Code style

- TypeScript in strict mode. Vanilla DOM, no UI framework.
- Code, comments, file names, commit messages and docs in English.
- [Conventional Commits](https://www.conventionalcommits.org) for commit messages, small commits per change (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`).
- Branch names: `type/short-kebab-description`, e.g. `fix/liked-songs-count`.

## Pull requests

- One topic per PR; keep diffs small.
- Describe what you tested and on which browsers.
- If the PR adds a feature, update the README and the manual-test checklist in `docs/manual-test.md`.
- Security-sensitive changes are described in [SECURITY.md](SECURITY.md); do not file those as public PRs.
