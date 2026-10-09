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
    expect(label('playcounts', 'xx')).toBe('Plays');
  });

  it('covers the main languages and prefers a full tag over its base language', () => {
    expect(label('playcounts', 'es-419')).toBe('Reproducciones');
    expect(label('playcounts', 'pt-BR')).toBe('Reproduções');
    expect(label('playcounts', 'de')).toBe('Wiedergaben');
    expect(label('playcounts', 'zh-CN')).toBe('播放次数');
    expect(label('playcounts', 'zh-TW')).toBe('播放次數');
  });

  it('reads the page language', () => {
    document.documentElement.lang = 'it';
    expect(label('playcounts')).toBe('Riproduzioni');
  });
});
