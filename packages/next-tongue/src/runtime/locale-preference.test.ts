import { describe, expect, it } from 'vitest';
import {
  signLocalePreference,
  verifyLocalePreference,
  timingSafeEqual,
} from './locale-preference.js';

const SECRET = 'test-secret-for-hmac';

describe('timingSafeEqual', () => {
  it('accepts equal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });
  it('rejects unequal length or content', () => {
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });
});

describe('locale preference HMAC (#48)', () => {
  it('round-trips a signed value', async () => {
    const value = await signLocalePreference('de', SECRET, { maxAge: 3600 });
    expect(await verifyLocalePreference(value, SECRET)).toBe('de');
  });

  it('rejects tampered locale', async () => {
    const value = await signLocalePreference('de', SECRET);
    const tampered = value.replace(/^de\./, 'fr.');
    expect(await verifyLocalePreference(tampered, SECRET)).toBeUndefined();
  });

  it('rejects wrong secret', async () => {
    const value = await signLocalePreference('de', SECRET);
    expect(await verifyLocalePreference(value, 'other')).toBeUndefined();
  });

  it('rejects expired signatures', async () => {
    const value = await signLocalePreference('de', SECRET, {
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    expect(await verifyLocalePreference(value, SECRET)).toBeUndefined();
  });

  it('rejects malformed / empty', async () => {
    expect(await verifyLocalePreference('', SECRET)).toBeUndefined();
    expect(await verifyLocalePreference('de.1', SECRET)).toBeUndefined();
    expect(await verifyLocalePreference(null, SECRET)).toBeUndefined();
  });

  it('filters by locales allow-list', async () => {
    const value = await signLocalePreference('de', SECRET);
    expect(
      await verifyLocalePreference(value, SECRET, { locales: ['en'] }),
    ).toBeUndefined();
    expect(
      await verifyLocalePreference(value, SECRET, { locales: ['en', 'de'] }),
    ).toBe('de');
  });
});

describe('Node 18 (no global crypto)', () => {
  it('falls back to node:crypto webcrypto and produces the same signature', async () => {
    const withGlobal = await signLocalePreference('de', SECRET, { exp: 2_000_000_000 });
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      expect((globalThis as { crypto?: unknown }).crypto).toBeUndefined();
      const without = await signLocalePreference('de', SECRET, { exp: 2_000_000_000 });
      expect(without).toBe(withGlobal);
      expect(await verifyLocalePreference(without, SECRET)).toBe('de');
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });
});
