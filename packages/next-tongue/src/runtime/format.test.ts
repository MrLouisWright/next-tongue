import { describe, expect, it } from 'vitest';
import { createFormat } from './format.js';

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
});
