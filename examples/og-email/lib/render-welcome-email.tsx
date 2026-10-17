import { createElement, type ReactNode } from 'react';
import { getDir, getFormat, getT } from 'next-tongue/server';

export type WelcomeEmailResult = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Render a welcome email for a *stored* user locale + time zone (ADR 0002).
 * Never reads request headers — pass locale explicitly from the user record.
 * Caller must have called `ensureTongue()` (or `__setServerRuntime` in tests).
 *
 * Uses dynamic `react-dom/server` import so App Route / Turbopack does not
 * treat this module as a React Server Component graph edge.
 */
export async function renderWelcomeEmail(
  locale: string,
  user: { name: string; createdAt: Date; timeZone?: string },
): Promise<WelcomeEmailResult> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const t = await getT(locale, 'emails');
  const f = await getFormat(locale, {
    timeZone: user.timeZone ?? 'UTC',
  });
  const joined = f.dateTime(user.createdAt, { dateStyle: 'medium' });
  const subject = t('welcomeSubject', { name: user.name });
  const text = t('welcomeBody', { joined });
  const rich = t.rich('welcomeRich', {
    link: (chunks: unknown) =>
      createElement('a', { href: 'https://example.com/docs' }, chunks as ReactNode),
  });

  const html = renderToStaticMarkup(
    createElement(
      'div',
      { dir: getDir(locale) },
      createElement('p', null, text),
      createElement('p', null, rich),
    ),
  );
  return { subject, text, html };
}
