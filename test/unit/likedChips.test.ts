// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTENDED_METADATA_URL, parseTrackDescriptors } from '../../src/page/adapters/extendedMetadata';
import type { SpclientRequests } from '../../src/page/core/spclient';
import { PlaylistToolsFeature } from '../../src/page/features/playlist-tools';
import type { AlbumStore } from '../../src/page/features/playlist-tools/albumStore';
import { pickChips } from '../../src/page/features/playlist-tools/chips';
import type { PlaylistStore } from '../../src/page/features/playlist-tools/playlistStore';
import { DescriptorLibrary } from '../../src/page/library/descriptors';
import type { LikedLibrary } from '../../src/page/library/likedLibrary';
import type { Playback } from '../../src/page/library/playback';
import type { ListTrack } from '../../src/page/ui/trackList';
import { parseDescriptorCache, type DescriptorCache } from '../../src/shared/descriptorCache';
import { envelopeToContent, envelopeToPage, parseContentToPage, parsePageToContent } from '../../src/shared/protocol';

const id = (n: number) => `T${String(n).padStart(21, '0')}`;
const concept = (name: string) => name.replace(/[^A-Za-z]/g, '').padEnd(22, 'x').slice(0, 22);
const KEY = 'a'.repeat(64);

// Minimal protobuf writer, for responses shaped like the live ones.
function varint(value: number): number[] {
  const out: number[] = [];
  while (value > 0x7f) {
    out.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  out.push(value);
  return out;
}
const bytesField = (field: number, data: number[]) => [...varint(field * 8 + 2), ...varint(data.length), ...data];
const textField = (field: number, text: string) => bytesField(field, [...new TextEncoder().encode(text)]);
const intField = (field: number, value: number) => [...varint(field * 8), ...varint(value)];
const floatField = (field: number, value: number) => [...varint(field * 8 + 5), ...new Uint8Array(new Float32Array([value]).buffer)];

function descriptor(name: string, classes: number[], weight = 0.7): number[] {
  return [
    ...textField(1, name.toLowerCase()),
    ...floatField(2, weight),
    ...bytesField(3, classes),
    ...textField(4, `spotify:concept:${concept(name)}`),
    ...textField(5, name),
  ];
}

function response(tracks: Record<string, [string, number[]][]>): Uint8Array {
  const entities = Object.entries(tracks).map(([trackId, list]) =>
    bytesField(3, [
      ...textField(2, `spotify:track:${trackId}`),
      ...bytesField(3, [
        ...textField(1, 'type.googleapis.com/spotify.descriptorextension.TrackDescriptor'),
        ...bytesField(2, list.flatMap(([name, classes]) => bytesField(1, descriptor(name, classes)))),
      ]),
    ]),
  );
  return new Uint8Array(bytesField(2, [...intField(2, 6), ...entities.flat()]));
}

describe('track descriptors', () => {
  it('reads concept, localized name, classes and weight per track', () => {
    const map = parseTrackDescriptors(response({ [id(1)]: [['Pop Punk', [1]], ['Nostalgia', [2, 6]]], [id(2)]: [] }));
    expect(map.get(id(1))).toEqual([
      { concept: concept('Pop Punk'), name: 'Pop Punk', classes: [1], weight: expect.closeTo(0.7, 5) },
      { concept: concept('Nostalgia'), name: 'Nostalgia', classes: [2, 6], weight: expect.closeTo(0.7, 5) },
    ]);
    expect(map.get(id(2))).toEqual([]);
    expect(() => parseTrackDescriptors(new Uint8Array([0x12, 9, 1]))).toThrow();
  });

  it('validates the stored cache and carries it on the bridge', () => {
    const cache: DescriptorCache = { v: 1, lang: 'it', concepts: { [concept('Rock')]: { n: 'Rock', c: [1] } }, tracks: { [id(1)]: [concept('Rock'), 'unknown'] } };
    expect(parseDescriptorCache(cache)!.tracks[id(1)]).toEqual([concept('Rock')]);
    expect(parseDescriptorCache({ ...cache, lang: '<script>' })).toBeNull();
    const toContent = parsePageToContent(envelopeToContent({ type: 'save-descriptors', key: KEY, cache }));
    expect(toContent).toMatchObject({ type: 'save-descriptors', key: KEY });
    expect(parsePageToContent(envelopeToContent({ type: 'load-descriptors', key: 'not-a-hash' }))).toBeNull();
    expect(parseContentToPage(envelopeToPage({ type: 'descriptors', key: KEY, cache }))).toMatchObject({ type: 'descriptors', key: KEY });
  });
});

describe('DescriptorLibrary', () => {
  function setup(stored: DescriptorCache | null = null, lang = 'it') {
    const postForProtobuf = vi.fn(async (_url: string, body: { entityRequest: { entityUri: string }[] }) =>
      response(Object.fromEntries(body.entityRequest.map((r) => [r.entityUri.split(':')[2]!, [['Rock', [1]]] as [string, number[]][]]))),
    );
    const save = vi.fn();
    const library = new DescriptorLibrary({
      spclient: { postForProtobuf } as unknown as SpclientRequests,
      storageKey: async () => KEY,
      load: async () => stored,
      save,
      lang: () => lang,
    });
    return { library, postForProtobuf, save };
  }

  it('asks only the missing tracks, 50 per request, with the player body, and saves', async () => {
    const stored: DescriptorCache = { v: 1, lang: 'it', concepts: {}, tracks: { [id(0)]: [] } };
    const { library, postForProtobuf, save } = setup(stored);
    const ids = Array.from({ length: 101 }, (_, i) => id(i));
    const cache = (await library.ensure(ids))!;
    expect(postForProtobuf).toHaveBeenCalledTimes(2);
    const [url, body] = postForProtobuf.mock.calls[0]!;
    expect(url).toBe(EXTENDED_METADATA_URL);
    expect(body.entityRequest).toHaveLength(50);
    expect(body.entityRequest[0]).toEqual({ entityUri: `spotify:track:${id(1)}`, query: [{ extensionKind: 6, etag: '' }] });
    expect(cache.tracks[id(100)]).toEqual([concept('Rock')]);
    expect(cache.concepts[concept('Rock')]).toEqual({ n: 'Rock', c: [1] });
    expect(save).toHaveBeenLastCalledWith(KEY, cache);
    await library.ensure(ids);
    expect(postForProtobuf).toHaveBeenCalledTimes(2);
  });

  it('starts over when the player language changed', async () => {
    const stored: DescriptorCache = { v: 1, lang: 'en', concepts: {}, tracks: { [id(1)]: [] } };
    const { library, postForProtobuf } = setup(stored, 'it');
    const cache = (await library.ensure([id(1)]))!;
    expect(cache.lang).toBe('it');
    expect(postForProtobuf).toHaveBeenCalledTimes(1);
  });
});

describe('chip choice', () => {
  it('takes varied genres and moods, frequent first, alternating', () => {
    const tracks: Record<string, string[]> = {};
    const concepts: DescriptorCache['concepts'] = {};
    const tag = (name: string, c: number[], ids: number[]) => {
      concepts[concept(name)] = { n: name, c };
      for (const n of ids) (tracks[id(n)] ??= []).push(concept(name));
    };
    const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
    tag('Rock', [1], range(0, 60));
    tag('Alternative Rock', [1, 16], range(0, 55)); // mostly the same songs as Rock: skipped
    tag('Rap', [1], range(60, 80));
    tag('Chill', [2, 3], range(40, 70));
    tag('Nostalgia', [2, 6], range(0, 25));
    tag('Rare', [1], [99]); // too few songs
    const ids = range(0, 100).map(id);
    const chips = pickChips(ids, { v: 1, lang: 'en', concepts, tracks });
    expect(chips.map((chip) => chip.name)).toEqual(['Rock', 'Chill', 'Rap', 'Nostalgia']);
    expect(chips[0]!.trackIds.size).toBe(60);
  });
});

describe('chips over Liked Songs', () => {
  const track = (n: number, name: string): ListTrack => ({ t: id(n), a: null, d: 1000 - n, n: name, ar: ['A'], ad: [null], al: 'Al', ai: null, c: '', ms: 1000, e: false });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the chips, filters the list with one, and restores everything with ✕', async () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <main><section data-testid="playlist-page">
        <div data-testid="entity-header"><div><span>5 songs</span><span>, </span><span>about 1 hr</span></div></div>
        <div data-testid="action-bar-row-trailing"><div id="view"><button role="combobox" aria-haspopup="true">List</button></div></div>
        <div><div id="wrapper"><div role="grid" data-testid="track-list">
          <div role="row"><div data-testid="tracklist-row"><a data-testid="internal-track-link" href="/track/x"><div>Song</div></a><div>3:00</div></div></div>
        </div></div></div>
      </section></main>`;
    const section = document.querySelector('section')!;
    const tracks = [track(1, 'One'), track(2, 'Two'), track(3, 'Three'), track(4, 'Four'), track(5, 'Five')];
    const cache: DescriptorCache = {
      v: 1,
      lang: 'en',
      concepts: { [concept('Rock')]: { n: 'Rock', c: [1] }, [concept('Chill')]: { n: 'Chill', c: [2] } },
      tracks: { [id(1)]: [concept('Rock')], [id(2)]: [concept('Rock'), concept('Chill')], [id(3)]: [concept('Rock')], [id(4)]: [concept('Chill')], [id(5)]: [concept('Chill')] },
    };
    const descriptors = { ensure: vi.fn(async () => cache) };
    const library = { subscribe: () => () => {}, ensureFresh: async () => {}, isLiked: () => true, index: { tracks }, profileUri: null } as unknown as LikedLibrary;
    const feature = new PlaylistToolsFeature({
      library,
      playback: {} as Playback,
      store: {} as PlaylistStore,
      albums: {} as AlbumStore,
      descriptors: descriptors as unknown as DescriptorLibrary,
    });
    const frame = () => new Promise((resolve) => setTimeout(resolve, 40));
    feature.enable();
    feature.onPageChange({ kind: 'collection', id: 'tracks' });
    await frame();
    await frame();

    const bar = section.querySelector('[data-sfe-chips]')!;
    const wrapper = section.querySelector<HTMLElement>('#wrapper')!;
    expect(bar.nextElementSibling).toBe(wrapper);
    expect([...bar.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent)).toEqual(['Rock', 'Chill']);
    expect(wrapper.style.display).toBe('');

    bar.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click();
    await frame();
    await frame();
    expect(wrapper.style.display).toBe('none');
    const names = () => [...section.querySelectorAll('[data-sfe-playlist-list] li a[href^="/track/"]')].map((a) => a.textContent);
    expect(names()).toEqual(['One', 'Two', 'Three']);
    // The header counts the chip's songs, like the desktop app ("77 brani, 5 ore 1 min").
    const header = () => section.querySelector('[data-testid="entity-header"]')!.textContent;
    expect(header()).toBe('3 songs, 0 min 3 sec');
    expect([...bar.querySelectorAll('button[aria-pressed]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Rock', 'true']]);

    bar.querySelector<HTMLButtonElement>('button[aria-label="Clear filter"]')!.click();
    await frame();
    expect(wrapper.style.display).toBe('');
    expect(section.querySelector('[data-sfe-playlist-list]')).toBeNull();
    expect(bar.querySelectorAll('button[aria-pressed]')).toHaveLength(2);
    expect(header()).toBe('5 songs, about 1 hr');

    feature.setChipsEnabled(false);
    await frame();
    expect(section.querySelector('[data-sfe-chips]')).toBeNull();
    feature.disable();
  });
});
