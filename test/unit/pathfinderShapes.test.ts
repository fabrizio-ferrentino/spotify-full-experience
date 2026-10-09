import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPlaycounts } from '../../src/page/adapters/pathfinderShapes';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pathfinder');
const responseOf = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), 'utf8')).response.json;

describe('extractPlaycounts', () => {
  it('reads every album track from getAlbum', () => {
    const json = responseOf('getAlbum.i-empire.json') as {
      data: { albumUnion: { tracksV2: { items: { track: { uri: string; playcount: string } }[] } } };
    };
    const items = json.data.albumUnion.tracksV2.items;
    const counts = extractPlaycounts(json);
    expect(counts.size).toBe(items.length);
    for (const { track } of items) {
      expect(counts.get(track.uri.split(':')[2] ?? '')).toBe(Number(track.playcount));
    }
  });

  it('reads top tracks from queryArtistOverview', () => {
    const counts = extractPlaycounts(responseOf('queryArtistOverview.angels-and-airwaves.json'));
    expect(counts.size).toBeGreaterThanOrEqual(10);
  });

  it('reads liked songs items from fetchPlaylist', () => {
    expect(extractPlaycounts(responseOf('fetchPlaylist.liked-songs.first-page.json')).size).toBe(3);
  });

  it('ignores responses without play counts', () => {
    expect(extractPlaycounts(responseOf('addToLibrary.like-track.json')).size).toBe(0);
  });

  it('is tolerant to odd values', () => {
    const id = '0yGrVvkJl1lMo4CcQShHd7';
    expect(extractPlaycounts({ a: [{ uri: `spotify:track:${id}`, playcount: 42 }] }).get(id)).toBe(42);
    for (const playcount of [null, '', '12a', -1, 1.5, '99999999999999999999']) {
      expect(extractPlaycounts({ uri: `spotify:track:${id}`, playcount }).size).toBe(0);
    }
    expect(extractPlaycounts({ uri: 'spotify:album:abc', playcount: '5' }).size).toBe(0);
    expect(extractPlaycounts(null).size).toBe(0);
  });
});
