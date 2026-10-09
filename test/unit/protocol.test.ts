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
    const envelope = envelopeToPage({ type: 'settings', settings: { debug: true } });
    expect(parseContentToPage(envelope)).toEqual({ type: 'settings', settings: { debug: true } });
  });

  it('rejects messages with the wrong direction', () => {
    const envelope = envelopeToPage({ type: 'settings', settings: { debug: true } });
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

  it('drops unknown settings keys and sanitizes values', () => {
    const msg = parseContentToPage({
      ns: BRIDGE_NAMESPACE,
      dir: 'to-page',
      type: 'settings',
      settings: { debug: 'yes', token: 'Bearer abc' },
    });
    expect(msg).toEqual({ type: 'settings', settings: { debug: false } });
  });
});
