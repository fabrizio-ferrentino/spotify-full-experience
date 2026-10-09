// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { popularBlockOf } from '../../src/page/adapters/spotifyDom';
import { LikedSongsCard } from '../../src/page/features/artist-liked-songs/card';
import { LikedSongsView } from '../../src/page/features/artist-liked-songs/view';
import type { LikedTrack } from '../../src/shared/likedIndex';

function buildArtistPage(): HTMLElement {
  document.documentElement.lang = 'it';
  document.body.innerHTML = `
    <main>
      <div data-testid="artist-page" id="page">
        <div data-testid="grid-container">
          <div id="popular">
            <h2 class="heading">Popolari</h2>
            <div>
              <div role="grid" data-testid="track-list">
                <div role="row"><div data-testid="tracklist-row">
                  <div role="gridcell"><a data-testid="internal-track-link" href="/track/x"><div class="row-title">Song</div></a></div>
                  <div role="gridcell"><div class="row-subdued">5:12</div></div>
                </div></div>
              </div>
            </div>
            <button>Altro</button>
          </div>
        </div>
      </div>
    </main>`;
  return document.querySelector('main')!;
}

const track = (c: string, n: string, al: string, d: string, extra: Partial<LikedTrack> = {}): LikedTrack => ({
  t: c.repeat(22),
  a: 'B'.repeat(22),
  d: Date.parse(d),
  n,
  ar: ['Angels & Airwaves'],
  al,
  ai: 'L'.repeat(22),
  c: 'https://i/64',
  ms: 234000,
  e: false,
  ...extra,
});
const tracks = [
  track('A', 'The Wolfpack', 'The Dream Walker', '2026-10-07T10:00:00Z'),
  track('C', 'Call To Arms', 'I-Empire', '2026-06-21T10:00:00Z', { e: true, ar: ['Angels & Airwaves', 'Guest'] }),
];
const now = Date.parse('2026-10-10T10:00:00Z');

describe('LikedSongsCard', () => {
  let main: HTMLElement;
  beforeEach(() => {
    main = buildArtistPage();
  });

  it('adds a desktop-like section right after the Popular block', () => {
    const block = popularBlockOf(main)!;
    expect(block.id).toBe('popular');
    const onOpen = vi.fn();
    const card = new LikedSongsCard(block, onOpen);
    card.update({ artistName: 'Angels & Airwaves', imageUrl: null, count: 17 });
    card.mount();
    card.mount();
    expect(block.nextElementSibling).toBe(card.root);
    expect(main.querySelectorAll('[data-sfe-liked]').length).toBe(1);
    expect(card.root.querySelector('h2')?.textContent).toBe('Cosa ti è piaciuto');
    expect(card.root.querySelector('h2')?.className).toBe('heading');
    expect(card.root.textContent).toContain('17 brani');
    expect(card.root.textContent).toContain('Di Angels & Airwaves');
    expect(card.root.querySelector('.row-title')).not.toBeNull();
    card.root.querySelector('button')!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('ignores pages without the observed Popular structure', () => {
    document.body.innerHTML = '<main><div><div data-testid="track-list"></div></div></main>';
    expect(popularBlockOf(document.querySelector('main')!)).toBeNull();
  });
});

describe('LikedSongsView', () => {
  it('replaces the artist page content until closed, and restores it exactly', () => {
    const main = buildArtistPage();
    const page = main.querySelector<HTMLElement>('#page')!;
    const before = main.innerHTML;
    const onClose = vi.fn();
    const card = new LikedSongsCard(popularBlockOf(main)!, () => {});
    const view = new LikedSongsView(page, card.typography, onClose, 24);
    view.open({ artistName: 'Angels & Airwaves', tracks, now });

    expect(page.style.display).toBe('none');
    expect(page.previousElementSibling).toBe(view.root);
    expect(view.root.querySelector('h2')?.textContent).toBe('Brani che ti piacciono di Angels & Airwaves');
    expect(view.root.textContent).toContain('Aggiunto il giorno');
    const rows = [...view.root.querySelectorAll('li')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('The Wolfpack');
    expect(rows[0]!.textContent).toContain('3 giorni fa');
    expect(rows[0]!.textContent).toContain('3:54');
    expect(rows[1]!.textContent).toContain('21 giu 2026');
    expect(rows[1]!.textContent).toContain('Angels & Airwaves, Guest');
    expect(rows[1]!.querySelector('[title="Esplicito"]')?.textContent).toBe('E');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(main.innerHTML).toBe(before);
    view.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens titles and albums inside the app', () => {
    const main = buildArtistPage();
    const card = new LikedSongsCard(popularBlockOf(main)!, () => {});
    const view = new LikedSongsView(main.querySelector<HTMLElement>('#page')!, card.typography, () => {}, 0);
    view.open({ artistName: 'X', tracks, now });
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);
    view.root.querySelector<HTMLAnchorElement>(`a[href="/track/${'A'.repeat(22)}"]`)!.click();
    expect(location.pathname).toBe(`/track/${'A'.repeat(22)}`);
    view.root.querySelector<HTMLAnchorElement>(`a[href="/album/${'L'.repeat(22)}"]`)!.click();
    expect(location.pathname).toBe(`/album/${'L'.repeat(22)}`);
    expect(popstate).toHaveBeenCalledTimes(2);
  });
});
