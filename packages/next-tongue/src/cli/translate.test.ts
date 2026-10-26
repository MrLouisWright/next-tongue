import { describe, expect, it } from 'vitest';
import { maskIcu, validateParity } from './translate.js';

describe('maskIcu', () => {
  it('round-trips args and tags', () => {
    const { masked, restore } = maskIcu('Hello {name} <b>x</b>');
    expect(masked).toContain('__TONGUE_0__');
    expect(restore(masked.replace('Hello', 'Hallo'))).toBe('Hallo {name} <b>x</b>');
  });
  it('rejects missing tokens', () => {
    const { restore } = maskIcu('Hi {name}');
    expect(restore('Hi')).toBeNull();
  });
});

describe('validateParity', () => {
  it('accepts matching args', () => {
    expect(() => validateParity('Hello {name}', 'Hallo {name}', 'de')).not.toThrow();
  });
  it('rejects missing args', () => {
    expect(() => validateParity('Hello {name}', 'Hallo', 'de')).toThrow(/arg mismatch/);
  });
  it('rejects invalid plural categories', () => {
    expect(() =>
      validateParity('{n, plural, one {# x} other {# xs}}', '{n, plural, one {# x} few {# y} other {# xs}}', 'de'),
    ).toThrow(/plural/);
  });
});
