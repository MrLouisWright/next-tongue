import { describe, expect, it } from 'vitest';
import { getDir, getOgLocale } from './locale.js';

describe('getDir (#39)', () => {
  it('returns rtl for Arabic and related scripts', () => {
    expect(getDir('ar')).toBe('rtl');
    expect(getDir('ar-EG')).toBe('rtl');
    expect(getDir('he')).toBe('rtl');
  });

  it('returns ltr for Latin locales', () => {
    expect(getDir('en')).toBe('ltr');
    expect(getDir('de')).toBe('ltr');
  });
});

describe('getOgLocale', () => {
  it('uses underscore separators', () => {
    expect(getOgLocale('en-US')).toBe('en_US');
    expect(getOgLocale('zh-Hant')).toBe('zh_Hant');
  });
});
