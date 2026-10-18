import { describe, expect, it, beforeEach } from 'vitest';
import { TongueError } from '../errors.js';
import {
  __setServerRuntime,
  getT,
  getFormat,
  isRootParamsEnabled,
} from './index.js';

beforeEach(() => {
  __setServerRuntime({
    locales: ['en', 'de'],
    defaultLocale: 'en',
    rootParams: false,
    loadNamespace: async (ns) => {
      if (ns === 'home') {
        return {
          title: () => 'Hello',
        };
      }
      return {
        root: () => 'Root',
      };
    },
  });
});

describe('getT rootParams opt-in (#24)', () => {
  it('single-arg is locale + _root when rootParams is off', async () => {
    const t = await getT('de');
    expect(t('root')).toBe('Root');
  });

  it('getT(locale, [ns, …]) returns a map of translators', async () => {
    __setServerRuntime({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      loadNamespace: async (ns) => {
        if (ns === 'home') return { title: () => 'Home' };
        if (ns === 'common') return { seeAll: () => 'See all' };
        return {};
      },
    });
    const { home, common } = await getT('en', ['home', 'common']);
    expect(home('title')).toBe('Home');
    expect(common('seeAll')).toBe('See all');
  });

  it('getT(ns) reads locale from root-params when enabled', async () => {
    __setServerRuntime({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      rootParams: true,
      readRootLocale: async () => 'de',
      loadNamespace: async (ns) => {
        if (ns === 'home') {
          return { title: () => 'Hallo' };
        }
        return {};
      },
    });
    expect(isRootParamsEnabled()).toBe(true);
    // 'home' is not a locale tag → treated as namespace under rootParams
    const t = await getT('home');
    expect(t('title')).toBe('Hallo');
    const tEn = await getT('en', 'home');
    expect(tEn('title')).toBe('Hallo');
  });

  it('getFormat() without locale uses root-params', async () => {
    __setServerRuntime({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      rootParams: true,
      readRootLocale: async () => 'de',
      timeZone: 'UTC',
    });
    const format = await getFormat();
    expect(format.number(1.5)).toMatch(/1/);
  });

  it('getFormat() without locale throws when rootParams is off', async () => {
    await expect(getFormat()).rejects.toBeInstanceOf(TongueError);
  });

  it('throws a clear error when root-params module is missing', async () => {
    __setServerRuntime({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      rootParams: true,
      // no readRootLocale → tries next/root-params
    });
    await expect(getT('home')).rejects.toMatchObject({
      code: 'TONGUE_E_CONFIG',
    });
  });
});
