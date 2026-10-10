import { describe, expect, it } from 'vitest';
import {
  BRIDGE_NAMESPACE,
  envelopeToContent,
  envelopeToPage,
  parseContentToPage,
  parsePageToContent,
} from '../../src/shared/protocol';

describe('bridge protocol', () => {
  it('round-trips a hello message', () => {
    expect(parsePageToContent(envelopeToContent({ type: 'hello' }))).toEqual({ type: 'hello' });
  });

  it('round-trips a settings message', () => {
    const envelope = envelopeToPage({ type: 'settings', settings: { debug: true, playcounts: false, likedSongs: true, playlistTools: true, playcountsTitleWidth: 240 } });
    expect(parseContentToPage(envelope)).toEqual({
      type: 'settings',
      settings: { debug: true, playcounts: false, likedSongs: true, playlistTools: true, playcountsTitleWidth: 240 },
    });
  });

  it('rejects messages with the wrong direction', () => {
    const envelope = envelopeToPage({ type: 'settings', settings: { debug: true, playcounts: true, likedSongs: true, playlistTools: true, playcountsTitleWidth: null } });
    expect(parsePageToContent(envelope)).toBeNull();
    expect(parseContentToPage(envelopeToContent({ type: 'hello' }))).toBeNull();
  });

  it('rejects foreign or malformed data', () => {
    for (const data of [null, undefined, 42, 'hello', [], {}, { type: 'hello' }]) {
      expect(parsePageToContent(data)).toBeNull();
      expect(parseContentToPage(data)).toBeNull();
    }
    expect(parsePageToContent({ ns: 'other', dir: 'to-content', type: 'hello' })).toBeNull();
    expect(parsePageToContent({ ns: BRIDGE_NAMESPACE, dir: 'to-content', type: 'unknown' })).toBeNull();
    expect(parseContentToPage({ ns: BRIDGE_NAMESPACE, dir: 'to-page', type: 'settings' })).toBeNull();
  });

  it('accepts only plausible title widths from the page', () => {
    const send = (width: unknown) =>
      parsePageToContent({ ns: BRIDGE_NAMESPACE, dir: 'to-content', type: 'set-playcounts-title-width', width });
    expect(send(250.4)).toEqual({ type: 'set-playcounts-title-width', width: 250 });
    expect(send(null)).toEqual({ type: 'set-playcounts-title-width', width: null });
    for (const width of [undefined, -5, 10, 1e9, NaN, '250', {}]) expect(send(width)).toBeNull();
  });

  it('drops unknown settings keys and sanitizes values', () => {
    const msg = parseContentToPage({
      ns: BRIDGE_NAMESPACE,
      dir: 'to-page',
      type: 'settings',
      settings: { debug: 'yes', token: 'Bearer abc' },
    });
    expect(msg).toEqual({ type: 'settings', settings: { debug: false, playcounts: true, likedSongs: true, playlistTools: true, playcountsTitleWidth: null } });
  });
});
