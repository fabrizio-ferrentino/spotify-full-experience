// Last-resort persisted query hashes, used only when neither the live traffic nor the player's
// bundles provide one (hash registry source 3). Hashes rotate with player releases.
// Observed on 2026-10-10 (web-player.c884aee7.js); several operations share a document hash.

export const KNOWN_HASHES_DATE = '2026-10-10';

export const KNOWN_HASHES: Readonly<Record<string, string>> = {
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  fetchPlaylist: '8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a',
  fetchPlaylistContents: '8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a',
  getAlbum: '11c9cad9cb24c4f9e25ef9456f68621cfd6006a90f679e729c1d2f2fd70dfe16',
  queryAlbumTracks: '11c9cad9cb24c4f9e25ef9456f68621cfd6006a90f679e729c1d2f2fd70dfe16',
  queryArtistOverview: '9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6',
};
