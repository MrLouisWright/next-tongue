import { describe, expect, it, beforeEach } from 'vitest';
import { TongueError } from '../errors.js';
import { verifyLocalePreference } from '../runtime/locale-preference.js';
import { __setServerRuntime } from './index.js';
import { setLocalePreference } from './locale-preference.js';

const SECRET = 'unit-test-secret';

beforeEach(() => {
  __setServerRuntime({
    locales: ['en', 'de'],
    defaultLocale: 'en',
  });
});

describe('setLocalePreference (#48)', () => {
  it('validates, saves, and sets a verifiable cookie', async () => {
    const cookies: Array<{ name: string; value: string }> = [];
    let saved: string | undefined;
    const locale = await setLocalePreference('de', {
      secret: SECRET,
      save: (l) => {
        saved = l;
      },
      cookieStore: {
        set(name, value) {
          cookies.push({ name, value });
        },
      },
    });
    expect(locale).toBe('de');
    expect(saved).toBe('de');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe('TONGUE_PREF');
    expect(await verifyLocalePreference(cookies[0]!.value, SECRET)).toBe('de');
  });

  it('throws TONGUE_E_LOCALE on invalid locale', async () => {
    await expect(
      setLocalePreference('fr', {
        secret: SECRET,
        cookieStore: { set() {} },
      }),
    ).rejects.toBeInstanceOf(TongueError);
  });

  it('throws when secret is missing', async () => {
    await expect(
      setLocalePreference('de', {
        secret: '',
        cookieStore: { set() {} },
      }),
    ).rejects.toMatchObject({ code: 'TONGUE_E_CONFIG' });
  });
});
