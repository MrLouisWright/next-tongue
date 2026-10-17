import { describe, expect, it } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createT, type MessageFn } from './create-t.js';
import { richJoin, richSelf, richTag } from './rich.js';

function makeRichTerms(): MessageFn {
  const fn = ((locale: string, values?: Record<string, unknown>) => {
    void values;
    if (locale === 'de') return 'Ich akzeptiere die Bedingungen.';
    if (locale === 'pl') return 'Akceptuję warunki.';
    if (locale === 'ar') return 'أوافق على الشروط.';
    return 'I accept the terms.';
  }) as MessageFn;

  fn.rich = (locale, values) => {
    const link = values?.link as ((chunks: ReactNode) => ReactNode) | undefined;
    if (locale === 'de') {
      return richJoin([
        'Ich akzeptiere die ',
        richTag(link, 'Bedingungen', 0),
        '.',
      ]);
    }
    if (locale === 'pl') {
      return richJoin([
        'Akceptuję ',
        richTag(link, 'warunki', 0),
        '.',
      ]);
    }
    if (locale === 'ar') {
      return richJoin([
        'أوافق على ',
        richTag(link, 'الشروط', 0),
        '.',
      ]);
    }
    return richJoin([
      'I accept the ',
      richTag(link, 'terms', 0),
      '.',
    ]);
  };
  return fn;
}

function makeBreak(): MessageFn {
  const fn = ((locale: string) => {
    if (locale === 'de') return 'ZeileUmbruch';
    return 'Linebreak';
  }) as MessageFn;
  fn.rich = (_locale, values) => {
    const br = values?.br as (() => ReactNode) | undefined;
    return richJoin(['Line', richSelf(br, 0), 'break']);
  };
  return fn;
}

describe('t.rich', () => {
  const locales = ['en', 'de', 'pl', 'ar'] as const;

  it('renders tag handlers for en, de, pl, ar', () => {
    for (const locale of locales) {
      const t = createT({
        locale,
        messages: { terms: makeRichTerms() },
      });
      const html = renderToStaticMarkup(
        createElement(
          'div',
          null,
          t.rich('terms', {
            link: (chunks: ReactNode) => createElement('a', { href: '/t' }, chunks),
          }),
        ),
      );
      expect(html).toContain('<a href="/t">');
      expect(html).toMatch(/terms|Bedingungen|warunki|الشروط/);
    }
  });

  it('strips tags for plain t()', () => {
    const t = createT({ locale: 'en', messages: { terms: makeRichTerms() } });
    expect(t('terms')).toBe('I accept the terms.');
  });

  it('supports self-closing tags', () => {
    const t = createT({ locale: 'en', messages: { line: makeBreak() } });
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        t.rich('line', { br: () => createElement('br') }),
      ),
    );
    expect(html).toBe('<div>Line<br/>break</div>');
  });

  it('passes chunks through when a tag handler is omitted', () => {
    const t = createT({ locale: 'en', messages: { terms: makeRichTerms() } });
    const html = renderToStaticMarkup(
      createElement('div', null, t.rich('terms', {})),
    );
    expect(html).toBe('<div>I accept the terms.</div>');
  });

  it('XSS: values stay text; omitted tags never become raw HTML (#46)', () => {
    const withPayload = ((locale: string) => {
      void locale;
      return 'Click me';
    }) as MessageFn;
    withPayload.rich = (_locale, values) => {
      const label = String(values?.label ?? '');
      return richJoin(['Click ', label]);
    };
    const t = createT({ locale: 'en', messages: { cta: withPayload } });
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        t.rich('cta', { label: '" onclick="alert(1)' as never }),
      ),
    );
    expect(html).toBe('<div>Click &quot; onclick=&quot;alert(1)</div>');
    expect(html).not.toMatch(/<[^>]+onclick=/i);
  });
});
