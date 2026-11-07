# Security policy

This extension runs on `open.spotify.com` and can see the traffic the web player sends and receives, including session tokens. I take reports about anything that could leak that data or abuse the user's session seriously.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Open a private report through GitHub's [Security Advisories](https://github.com/fabrizio-ferrentino/spotify-full-experience/security/advisories/new) instead.

Include what the issue is, how to reproduce it, and the extension version (shown in the popup footer). I usually reply within a few days; this is a personal project, so there is no formal SLA.

## In scope

- Leakage of Spotify session tokens, cookies or user identifiers through the extension (logs, storage, messages on the bridge, requests to non-Spotify domains).
- Requests the extension sends on the user's behalf without an explicit click.
- Code injection into the page or the extension's own pages (popup, options).
- Weakening of the extension's permissions, host matches or Content Security Policy.

## Out of scope

- Issues in the Spotify web player itself. Report those to Spotify.
- The extension's deliberate reliance on undocumented Spotify endpoints (see the README).
- Anything requiring a user to install a different, modified build of the extension.

## Supported versions

Only the latest release on the Chrome Web Store and Firefox Add-ons is supported. Fixes land there, not in older versions.
