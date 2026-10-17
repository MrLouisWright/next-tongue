import { describe, expect, it } from 'vitest';
import { cldrParents, resolveFallbackChain } from './fallback.js';

describe('cldrParents', () => {
  it('never crosses scripts for zh-Hant-HK', () => {
    expect(cldrParents('zh-Hant-HK')).toEqual(['zh-Hant', 'zh']);
  });

  it('strips region for de-AT', () => {
    expect(cldrParents('de-AT')).toEqual(['de']);
  });
});

describe('resolveFallbackChain', () => {
  it('uses explicit override', () => {
    expect(
      resolveFallbackChain('de-AT', 'en', { 'de-AT': 'de' }),
    ).toEqual(['de-AT', 'de', 'en']);
  });

  it('falls back along CLDR then default', () => {
    expect(resolveFallbackChain('zh-Hant-HK', 'en', {})).toEqual([
      'zh-Hant-HK',
      'zh-Hant',
      'zh',
      'en',
    ]);
  });
});
