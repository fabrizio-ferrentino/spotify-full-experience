// Last-resort persisted query hashes, used only when neither the live traffic nor the player's
// bundles provide one (hash registry source 3). Hashes rotate with player releases.
// Observed on 2026-10-10 (web-player.c884aee7.js); several operations share a document hash.

export const KNOWN_HASHES_DATE = '2026-10-10';

export const KNOWN_HASHES: Readonly<Record<string, string>> = {
  applyCurations: '05b739a3a73091c213385233b9d3ed8a857c2ca29d2eebadb3d04ed12e288697',
  editablePlaylists: 'd5c4b8096437dcc2ac9528c91dfcd299e35b747cda2f8f75d28f41f49c5092ba',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  fetchPlaylist: '8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a',
  fetchPlaylistContents: '8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a',
  getAlbum: '11c9cad9cb24c4f9e25ef9456f68621cfd6006a90f679e729c1d2f2fd70dfe16',
  getTrack: 'a8ef9e9f02b836feb0da3003c31dbb30decc6f4b473ef89ca88c882386d668de',
  queryAlbumTracks: '11c9cad9cb24c4f9e25ef9456f68621cfd6006a90f679e729c1d2f2fd70dfe16',
  queryArtistOverview: '9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6',
  // Observed on 2026-10-12 (xpui-root-dialogs.778247d9.js, matching the live traffic).
  queryTrackCreditsGroupedModal: 'f135fb9be58a72d041ab5d214d817021a272405d883860468e2627afb01a3ca9',
};
