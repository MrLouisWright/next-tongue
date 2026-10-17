import { describe, expect, it } from 'vitest';
import { findDynamicCalls, resolveFromKeys } from './dynamic-from.js';

describe('resolveFromKeys', () => {
  it('reads inline arrays', () => {
    expect(resolveFromKeys('', `['a', "b"]`)).toEqual(['a', 'b']);
  });

  it('reads same-file const arrays', () => {
    const src = `const BTN_FROM = ['btnSignIn', 'btnSignUp'] as const;`;
    expect(resolveFromKeys(src, 'BTN_FROM')).toEqual(['btnSignIn', 'btnSignUp']);
  });

  it('reads Object.values of same-file objects', () => {
    const src = `const BTN_KEYS = { in: 'btnSignIn', up: 'btnSignUp' } as const;`;
    expect(resolveFromKeys(src, 'Object.values(BTN_KEYS)')).toEqual([
      'btnSignIn',
      'btnSignUp',
    ]);
  });

  it('returns null for unresolved identifiers', () => {
    expect(resolveFromKeys('', 'BTN_FROM')).toBeNull();
  });
});

describe('findDynamicCalls', () => {
  it('parses key, from, and values', () => {
    const src = `t.dynamic(btnKey, { from: ["a", "b"] }, { count: 1 })`;
    const [call] = findDynamicCalls(src, 't');
    expect(call?.keyExpr).toBe('btnKey');
    expect(call?.keys).toEqual(['a', 'b']);
    expect(call?.valuesExpr).toBe('{ count: 1 }');
  });
});
