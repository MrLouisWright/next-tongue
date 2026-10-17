import { describe, expect, it, beforeEach } from 'vitest';
import { TongueError } from '../errors.js';
import { __setServerRuntime, withLocale } from './index.js';

beforeEach(() => {
  __setServerRuntime({
    locales: ['en', 'de'],
    defaultLocale: 'en',
  });
});

describe('withLocale (#26)', () => {
  it('passes through a valid locale', () => {
    const action = withLocale((locale: string, n: number) => `${locale}:${n}`);
    expect(action('de', 1)).toBe('de:1');
  });

  it('throws TONGUE_E_LOCALE on invalid locale', () => {
    const action = withLocale((locale: string) => locale);
    expect(() => action('fr')).toThrow(TongueError);
    try {
      action('../en');
    } catch (e) {
      expect((e as TongueError).code).toBe('TONGUE_E_LOCALE');
    }
  });
});
