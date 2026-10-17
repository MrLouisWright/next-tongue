import { describe, expect, it, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { __setServerRuntime } from 'next-tongue/server';
import type { MessageFn } from 'next-tongue/client';
import { renderWelcomeEmail } from './render-welcome-email.js';

function plain(
  fn: (locale: string, values?: Record<string, unknown>) => string,
): MessageFn {
  return fn as MessageFn;
}

function withRich(
  plainFn: (locale: string, values?: Record<string, unknown>) => string,
  richFn: (locale: string, values?: Record<string, unknown>) => ReactNode,
): MessageFn {
  const fn = plainFn as MessageFn;
  fn.rich = richFn;
  return fn;
}

beforeEach(() => {
  __setServerRuntime({
    locales: ['en', 'ar'],
    defaultLocale: 'en',
    timeZone: 'UTC',
    loadNamespace: async () => ({
      welcomeSubject: plain((locale, v) =>
        locale === 'ar' ? `أهلاً ${v?.name}!` : `Welcome, ${v?.name}!`,
      ),
      welcomeBody: plain((locale, v) =>
        locale === 'ar'
          ? `انضممت في ${v?.joined}.`
          : `You joined on ${v?.joined}.`,
      ),
      welcomeRich: withRich(
        (locale) => (locale === 'ar' ? 'شكراً — docs' : 'Thanks — docs'),
        (locale, values) => {
          const link = values?.link as
            | ((chunks: ReactNode) => ReactNode)
            | undefined;
          const label = locale === 'ar' ? 'اقرأ الوثائق' : 'read the docs';
          return createElement(
            'span',
            null,
            locale === 'ar' ? 'شكراً — ' : 'Thanks — ',
            link ? link(label) : label,
          );
        },
      ),
    }),
  });
});

describe('renderWelcomeEmail (#39)', () => {
  it('renders subject, text, and rich HTML for en', async () => {
    const result = await renderWelcomeEmail('en', {
      name: 'Ada',
      createdAt: new Date('2024-01-15T12:00:00Z'),
      timeZone: 'UTC',
    });
    expect(result.subject).toBe('Welcome, Ada!');
    expect(result.text).toMatch(/You joined on/);
    expect(result.html).toContain('href="https://example.com/docs"');
    expect(result.html).toContain('read the docs');
  });

  it('uses rtl dir for Arabic', async () => {
    const result = await renderWelcomeEmail('ar', {
      name: 'Ada',
      createdAt: new Date('2024-01-15T12:00:00Z'),
    });
    expect(result.subject).toContain('أهلاً');
    expect(result.html).toContain('dir="rtl"');
    expect(result.html).toContain('اقرأ الوثائق');
  });
});
