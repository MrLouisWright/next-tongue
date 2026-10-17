import { describe, expect, it } from 'vitest';
import { isValidBcp47, resolveConfig } from './validate.js';
import { TongueError } from '../errors.js';

describe('isValidBcp47', () => {
  it('accepts common tags', () => {
    expect(isValidBcp47('en')).toBe(true);
    expect(isValidBcp47('de-AT')).toBe(true);
    expect(isValidBcp47('zh-Hant-HK')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidBcp47('')).toBe(false);
    expect(isValidBcp47('../en')).toBe(false);
    expect(isValidBcp47('en\r\n')).toBe(false);
  });
});

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const c = resolveConfig({ locales: ['en', 'de'], defaultLocale: 'en' });
    expect(c.messages).toBe('./messages/{locale}.json');
    expect(c.timeZone).toBe('UTC');
    expect(c.routing.prefix).toBe('as-needed');
    expect(c.outDir).toBe('.tongue');
  });

  it('requires defaultLocale ∈ locales', () => {
    expect(() =>
      resolveConfig({ locales: ['en'], defaultLocale: 'de' }),
    ).toThrow(TongueError);
  });

  it('requires {locale} in messages', () => {
    expect(() =>
      resolveConfig({
        locales: ['en'],
        defaultLocale: 'en',
        messages: './messages/en.json',
      }),
    ).toThrow(/locale/);
  });
});
