import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetTongueDev,
  getTongueDevSnapshot,
  installTongueDevReporter,
  tongueDevEscape,
  tongueDevLoaded,
  tongueDevMissing,
} from './dev-registry.js';

describe('dev-registry', () => {
  beforeEach(() => {
    __resetTongueDev();
  });

  it('records loaded, missing, and escaped keys', () => {
    tongueDevLoaded('home', 'title');
    tongueDevMissing('home.gone', 'de');
    tongueDevEscape('home', '/app/page.tsx');
    const snap = getTongueDevSnapshot();
    expect(snap.loaded).toEqual([
      { namespace: 'home', key: 'title', fullKey: 'home.title' },
    ]);
    expect(snap.missing[0]?.fullKey).toBe('home.gone');
    expect(snap.escapes[0]?.namespace).toBe('home');
  });

  it('installTongueDevReporter wires global hooks', () => {
    installTongueDevReporter();
    const g = globalThis as typeof globalThis & {
      __tongueDevLoaded?: (ns: string, key: string) => void;
      __tongueDevReport?: (e: {
        fullKey: string;
        locale: string;
        text: string;
        missing?: boolean;
      }) => void;
    };
    g.__tongueDevLoaded?.('home', 'inbox');
    g.__tongueDevReport?.({
      fullKey: 'missing',
      locale: 'en',
      text: 'missing',
      missing: true,
    });
    const snap = getTongueDevSnapshot();
    expect(snap.loaded.some((k) => k.fullKey === 'home.inbox')).toBe(true);
    expect(snap.missing.some((k) => k.fullKey === 'missing')).toBe(true);
  });
});
