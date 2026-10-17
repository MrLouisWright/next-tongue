import { describe, expect, it } from 'vitest';
import { createTestT } from './index.js';

describe('createTestT', () => {
  it('interpolates string messages', () => {
    const t = createTestT('en', 'home', {
      messages: { hello: 'Hello {name}' },
    });
    expect(t('hello', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('keysOnly echoes keys', () => {
    const t = createTestT('en', 'home', {
      keysOnly: true,
      messages: { inbox: 'unused' },
    });
    expect(t('inbox')).toBe('inbox');
  });

  it('accepts compiled MessageFn', () => {
    const t = createTestT('de', 'home', {
      messages: {
        title: (locale, values) =>
          locale === 'de'
            ? `Willkommen, ${values?.name}`
            : `Welcome, ${values?.name}`,
      },
    });
    expect(t('title', { name: 'Ada' })).toBe('Willkommen, Ada');
  });
});
