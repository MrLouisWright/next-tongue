import { describe, expect, it } from 'vitest';
import { createT, type MessageFn } from './create-t.js';
import { translateIssues } from './translate-issues.js';

function msg(fn: (locale: string, values?: Record<string, unknown>) => string): MessageFn {
  return fn as MessageFn;
}

const messages: Record<string, MessageFn> = {
  invalid_type: msg((_l, v) => `Expected ${v?.expected}, got ${v?.received}`),
  too_small: msg((_l, v) => `At least ${v?.minimum} characters`),
  invalid_string: msg(() => 'Enter a valid email'),
  required: msg(() => 'Required'),
  fallback: msg((_l, v) => `Unknown: ${v?.message}`),
};

function tEn() {
  return createT({ locale: 'en', messages });
}

describe('translateIssues (#38)', () => {
  it('maps Zod-shaped issues to dotted paths', () => {
    // Fixtures only — shaped like Zod's Standard Schema / flatten output
    const zodLike = [
      {
        message: 'invalid_string',
        path: ['email'],
      },
      {
        message: 'too_small',
        path: ['password'],
        params: { minimum: 8 },
      },
      {
        message: 'required',
        path: ['profile', 'name'],
      },
    ];
    expect(translateIssues(tEn(), zodLike)).toEqual({
      email: ['Enter a valid email'],
      password: ['At least 8 characters'],
      'profile.name': ['Required'],
    });
  });

  it('maps Valibot-shaped issues with { key } path segments', () => {
    const valibotLike = [
      {
        message: 'invalid_type',
        path: [{ key: 'age' }],
        params: { expected: 'number', received: 'string' },
      },
      {
        message: 'required',
        path: [{ key: 'address' }, { key: 'city' }],
      },
    ];
    expect(translateIssues(tEn(), valibotLike)).toEqual({
      age: ['Expected number, got string'],
      'address.city': ['Required'],
    });
  });

  it('puts root issues under empty string', () => {
    expect(
      translateIssues(tEn(), [{ message: 'required' }]),
    ).toEqual({ '': ['Required'] });
  });

  it('uses fallback for unknown keys', () => {
    expect(
      translateIssues(
        tEn(),
        [{ message: 'custom_code', path: ['x'] }],
        { fallback: 'fallback' },
      ),
    ).toEqual({ x: ['Unknown: custom_code'] });
  });

  it('honours formatPath override', () => {
    expect(
      translateIssues(
        tEn(),
        [{ message: 'required', path: ['a', 'b'] }],
        { formatPath: (p) => p.map(String).join('/') },
      ),
    ).toEqual({ 'a/b': ['Required'] });
  });

  it('accumulates multiple issues on the same path', () => {
    expect(
      translateIssues(tEn(), [
        { message: 'required', path: ['email'] },
        { message: 'invalid_string', path: ['email'] },
      ]),
    ).toEqual({
      email: ['Required', 'Enter a valid email'],
    });
  });
});
