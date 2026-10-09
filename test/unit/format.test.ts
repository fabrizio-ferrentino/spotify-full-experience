// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatCount, label } from '../../src/page/ui/format';

describe('formatCount', () => {
  it('groups digits in the page locale', () => {
    expect(formatCount(2441116, 'it')).toBe('2.441.116');
    expect(formatCount(2441116, 'en')).toBe('2,441,116');
  });

  it('falls back on invalid locales', () => {
    expect(formatCount(1000, 'not a locale!')).toBe('1,000');
  });
});

describe('label', () => {
  it('localises the column label with an English fallback', () => {
    expect(label('playcounts', 'it')).toBe('Riproduzioni');
    expect(label('playcounts', 'it-IT')).toBe('Riproduzioni');
    expect(label('playcounts', 'en')).toBe('Plays');
    expect(label('playcounts', 'de')).toBe('Plays');
  });

  it('reads the page language', () => {
    document.documentElement.lang = 'it';
    expect(label('playcounts')).toBe('Riproduzioni');
  });
});
