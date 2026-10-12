// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditablePlaylist } from '../../src/page/adapters/libraryShapes';
import { SaveDialog } from '../../src/page/ui/saveDialog';

const ROW_HEIGHT = 48;
const CHROME_HEIGHT = 120;

function playlists(count: number): EditablePlaylist[] {
  return Array.from({ length: count }, (_, i) => ({
    uri: `spotify:playlist:${String(i).padStart(22, 'P')}`,
    name: `Playlist ${i}`,
    imageUrl: null,
    curates: false,
    liked: false,
  })) as EditablePlaylist[];
}

describe('"Save in" dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('stays inside the window once a long list of playlists arrives', async () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const innerHeight = window.innerHeight;
    // The anchor sits near the bottom; the dialog grows with its rows (capped like the CSS).
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === anchor) return { top: innerHeight - 60, bottom: innerHeight - 36, left: 900, right: 924, width: 24, height: 24 } as DOMRect;
      if (this.hasAttribute('data-sfe-liked-save')) {
        const height = Math.min(CHROME_HEIGHT + this.querySelectorAll('li').length * ROW_HEIGHT, innerHeight - 16);
        return { top: 0, bottom: height, left: 0, right: 320, width: 320, height } as DOMRect;
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
    });

    const dialog = new SaveDialog('');
    let resolve: (value: EditablePlaylist[]) => void = () => {};
    dialog.open(anchor, () => new Promise((r) => (resolve = r)), () => {}, () => {});
    const root = document.querySelector<HTMLElement>('[data-sfe-liked-save]')!;
    resolve(playlists(40));
    await new Promise((r) => setTimeout(r, 0));

    const top = parseFloat(root.style.top);
    const height = root.getBoundingClientRect().height;
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + height).toBeLessThanOrEqual(innerHeight - 8);
    expect(root.style.maxHeight).toBe('calc(100vh - 16px)');
    // The buttons are after the scrolling list, so they stay visible.
    expect(root.lastElementChild!.querySelectorAll('button')).toHaveLength(2);
    dialog.close();
  });
});
