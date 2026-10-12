# Privacy policy

Full Experience for Spotify is a browser extension that runs only on the Spotify web player (`open.spotify.com`). It has no server of its own, so nothing it reads ever reaches the author or anyone else.

Last updated: October 10, 2026.

## What it reads

- The responses the web player already receives from Spotify while you browse: album tracks with their play counts, your liked songs, playlists you open.
- When that is not enough (for example, the full list of a long playlist you search in), the extension asks Spotify for it, through the same session the web player uses and at a limited rate.
- The session token the web player sends with its own requests. The extension keeps it in memory to make those requests to Spotify. It never stores, logs or sends it anywhere else.

## What it stores, and where

Everything stays in the browser's extension storage on your device:

- Your settings (which features are on, a column width).
- An index of your liked songs, used by the "liked songs on artist pages" feature: for each song its Spotify ID, title, artists, album, cover link, duration and the date you liked it. It is saved under a hashed key, never under your user ID.
- For the genre and mood filters in Liked Songs: the genres and moods ("descriptors") of your liked songs, as Spotify describes them, under the same hashed key.

Removing the extension deletes this data. Playlist contents and play counts are kept only in memory and are gone when you close the tab.

## What it sends

- Requests to Spotify's own servers, the same ones the web player uses, to read the data above. The genres and moods of your liked songs are asked once (about one request per 50 songs) and then only for songs you like later.
- Player and library commands (play, add to queue, add to a playlist, like or unlike a song) only when you click the matching button or menu item.
- From a song's menu, like the web player's own: its credits and its radio playlist when you pick those entries; whether the song is excluded from your taste profile when you open the menu, and the change when you pick "Exclude" or "Include". These requests carry your Spotify user name, as the player's do; the extension keeps it in memory only.

The extension has no analytics, no tracking and no ads. It does not sell or share any data, and it does not send data to any domain other than Spotify's.

## Debug mode

If you turn on debug mode, the extension writes the structure of the web player's requests to the browser console of the Spotify tab, on your device. Values such as tokens are not logged.

## Contact

Questions or problems: [open an issue](https://github.com/fabrizio-ferrentino/spotify-full-experience/issues) on GitHub.

The extension is not affiliated with, endorsed by or sponsored by Spotify.
