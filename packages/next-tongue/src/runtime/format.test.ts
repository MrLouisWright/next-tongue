import { describe, expect, it } from 'vitest';
import { createFormat, isSanctionedUnit } from './format.js';

describe('createFormat', () => {
  it('formats numbers and dates with explicit timeZone', () => {
    const f = createFormat({ locale: 'en', timeZone: 'UTC' });
    expect(f.number(1234.5, { maximumFractionDigits: 1 })).toMatch(/1,234\.5/);
    const d = f.dateTime(Date.UTC(2024, 0, 15), { dateStyle: 'short' });
    expect(d).toContain('24');
  });

  it('relativeTime requires explicit now', () => {
    const f = createFormat({ locale: 'en', timeZone: 'UTC' });
    const now = Date.UTC(2024, 0, 15);
    const then = now - 3600_000;
    expect(f.relativeTime(then, now)).toMatch(/hour/);
  });

  it('dateTime ignores process TZ when timeZone is explicit (ADR 0008)', () => {
    const instant = Date.UTC(2024, 0, 15, 12, 0, 0);
    const prev = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const easternHost = createFormat({ locale: 'en', timeZone: 'UTC' });
      process.env.TZ = 'Asia/Tokyo';
      const tokyoHost = createFormat({ locale: 'en', timeZone: 'UTC' });
      const a = easternHost.dateTime(instant, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const b = tokyoHost.dateTime(instant, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      expect(a).toBe(b);
      expect(a).toMatch(/Jan.*15.*2024/i);
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe('Format helpers (#45)', () => {
  const locales = ['en', 'de', 'ar', 'ja'] as const;

  it('list formats conjunctions across locales', () => {
    for (const locale of locales) {
      const f = createFormat({ locale, timeZone: 'UTC' });
      const out = f.list(['A', 'B', 'C'], { type: 'conjunction' });
      expect(out.length).toBeGreaterThan(3);
      expect(out).toContain('A');
      expect(out).toContain('C');
    }
    expect(
      createFormat({ locale: 'en', timeZone: 'UTC' }).list(['A', 'B'], {
        type: 'conjunction',
      }),
    ).toBe('A and B');
    expect(
      createFormat({ locale: 'de', timeZone: 'UTC' }).list(['A', 'B'], {
        type: 'conjunction',
      }),
    ).toBe('A und B');
  });

  it('relativeTime localizes across locales', () => {
    const now = Date.UTC(2024, 0, 15, 12);
    const then = now - 3600_000;
    for (const locale of locales) {
      const f = createFormat({ locale, timeZone: 'UTC' });
      const out = f.relativeTime(then, now);
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toMatch(/NaN/);
    }
    expect(
      createFormat({ locale: 'en', timeZone: 'UTC' }).relativeTime(then, now),
    ).toMatch(/hour/i);
  });

  it('unit formats sanctioned simple and compound units', () => {
    for (const locale of locales) {
      const f = createFormat({ locale, timeZone: 'UTC' });
      const km = f.unit(5, 'kilometer', { unitDisplay: 'short' });
      expect(km).toMatch(/[5٥۵]/) // Node 18 ICU uses Arabic-Indic digits for ar;
      const speed = f.unit(100, 'kilometer-per-hour');
      expect(speed).toMatch(/100/);
    }
    const en = createFormat({ locale: 'en', timeZone: 'UTC' }).unit(
      5,
      'kilometer',
      { unitDisplay: 'long' },
    );
    expect(en.toLowerCase()).toMatch(/kilometer/);
  });

  it('displayName localizes language and region codes', () => {
    expect(
      createFormat({ locale: 'en', timeZone: 'UTC' }).displayName('de', {
        type: 'language',
      }),
    ).toMatch(/German/i);
    expect(
      createFormat({ locale: 'de', timeZone: 'UTC' }).displayName('de', {
        type: 'language',
      }),
    ).toMatch(/Deutsch/i);
    expect(
      createFormat({ locale: 'ja', timeZone: 'UTC' }).displayName('JP', {
        type: 'region',
      }),
    ).toMatch(/日本/);
    expect(
      createFormat({ locale: 'ar', timeZone: 'UTC' }).displayName('ar', {
        type: 'language',
      }).length,
    ).toBeGreaterThan(0);
  });

  it('isSanctionedUnit accepts simple and compound ids', () => {
    expect(isSanctionedUnit('kilometer')).toBe(true);
    expect(isSanctionedUnit('kilometer-per-hour')).toBe(true);
    expect(isSanctionedUnit('furlong')).toBe(false);
    expect(isSanctionedUnit('kilometer-per')).toBe(false);
  });
});
