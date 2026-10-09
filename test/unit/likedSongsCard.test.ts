// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { popularBlockOf } from '../../src/page/adapters/spotifyDom';
import { LikedSongsCard } from '../../src/page/features/artist-liked-songs/card';

function buildArtistPage(): HTMLElement {
  document.documentElement.lang = 'it';
  document.body.innerHTML = `
    <main>
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
    </main>`;
  return document.querySelector('main')!;
}

const tracks = [
  { t: 'A'.repeat(22), a: 'B'.repeat(22), d: Date.parse('2026-10-09T10:00:00Z'), n: 'Shove', al: 'Love, Pt. 1 & 2' },
  { t: 'C'.repeat(22), a: 'B'.repeat(22), d: Date.parse('2026-10-07T10:00:00Z'), n: 'Paralyzed', al: 'The Dream Walker' },
];
const now = Date.parse('2026-10-10T10:00:00Z');

describe('LikedSongsCard', () => {
  let main: HTMLElement;
  beforeEach(() => {
    main = buildArtistPage();
  });

  it('finds the Popular block and mounts right after it', () => {
    const block = popularBlockOf(main)!;
    expect(block.id).toBe('popular');
    const card = new LikedSongsCard(block);
    card.update({ artistName: 'Angels & Airwaves', imageUrl: null, tracks, now });
    card.mount();
    card.mount();
    expect(block.nextElementSibling).toBe(card.root);
    expect(main.querySelectorAll('[data-sfe-liked]').length).toBe(1);
    expect(card.root.querySelector('h2')?.textContent).toBe('Cosa ti è piaciuto');
    expect(card.root.querySelector('h2')?.className).toBe('heading');
    expect(card.root.textContent).toContain('2 brani');
    expect(card.root.textContent).toContain('Di Angels & Airwaves');
    // Typography borrowed from the Popular rows.
    expect(card.root.querySelector('.row-title')).not.toBeNull();
    expect(card.root.querySelector('.row-subdued')).not.toBeNull();
  });

  it('expands the list and opens tracks inside the app', () => {
    const card = new LikedSongsCard(popularBlockOf(main)!);
    card.update({ artistName: 'X', imageUrl: 'https://i/160', tracks, now });
    card.mount();
    const button = card.root.querySelector('button')!;
    const list = card.root.querySelector('ol')!;
    expect(list.hidden).toBe(true);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect([...list.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Shove', 'Paralyzed']);
    expect(list.textContent).toContain('ieri');

    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);
    list.querySelector('a')!.click();
    expect(location.pathname).toBe(`/track/${'A'.repeat(22)}`);
    expect(popstate).toHaveBeenCalledTimes(1);
  });

  it('ignores pages without the observed Popular structure', () => {
    document.body.innerHTML = '<main><div><div data-testid="track-list"></div></div></main>';
    expect(popularBlockOf(document.querySelector('main')!)).toBeNull();
  });
});
