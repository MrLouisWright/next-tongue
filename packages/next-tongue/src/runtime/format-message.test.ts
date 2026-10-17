import { describe, expect, it, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TongueError } from '../errors.js';
import {
  formatMessage,
  __resetFormatMessageCache,
  __formatMessageCacheSize,
  configureFormatMessage,
} from './format-message.js';

beforeEach(() => {
  __resetFormatMessageCache();
  configureFormatMessage({ cacheSize: 500, timeZone: 'UTC' });
});

describe('formatMessage', () => {
  it('formats arguments and plurals', () => {
    expect(formatMessage('en', 'Hello {name}', { name: 'Ada' })).toBe(
      'Hello Ada',
    );
    expect(
      formatMessage(
        'en',
        '{count, plural, =0 {none} one {# item} other {# items}}',
        { count: 2 },
      ),
    ).toBe('2 items');
  });

  it('strips tags by default', () => {
    expect(
      formatMessage('en', 'Save <b>{pct}</b> on <script>x</script>', {
        pct: '20%',
      }),
    ).toBe('Save 20% on x');
  });

  it('throws TONGUE_E_ICU_SYNTAX on invalid ICU', () => {
    expect(() => formatMessage('en', 'Hello {name')).toThrow(TongueError);
    try {
      formatMessage('en', 'Hello {name');
    } catch (e) {
      expect((e as TongueError).code).toBe('TONGUE_E_ICU_SYNTAX');
    }
  });

  it('evicts from LRU when over capacity', () => {
    configureFormatMessage({ cacheSize: 2 });
    formatMessage('en', 'a {x}', { x: 1 });
    formatMessage('en', 'b {x}', { x: 1 });
    expect(__formatMessageCacheSize()).toBe(2);
    formatMessage('en', 'c {x}', { x: 1 });
    expect(__formatMessageCacheSize()).toBe(2);
  });

  it('throws when document is defined (server-only guard)', () => {
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    g.document = {};
    try {
      expect(() => formatMessage('en', 'hi')).toThrow(TongueError);
    } finally {
      if (prev === undefined) delete g.document;
      else g.document = prev;
    }
  });
});

describe('formatMessage.rich XSS corpus', () => {
  function html(
    icu: string,
    values: Record<string, unknown> = {},
    tags?: Record<string, (c: unknown) => unknown>,
  ): string {
    const node = formatMessage.rich('en', icu, values, {
      tags: tags as never,
    });
    return renderToStaticMarkup(createElement('div', null, node));
  }

  it('never emits raw HTML from message tags without handlers', () => {
    const out = html('Hi <script>alert(1)</script> there');
    expect(out).toBe('<div>Hi alert(1) there</div>');
    expect(out).not.toContain('<script>');
  });

  it('never emits event-handler attributes from values', () => {
    const out = html('Click {payload}', {
      payload: '" onclick="alert(1)',
    });
    // React escapes quotes — value is text content, not an attribute
    expect(out).toBe('<div>Click &quot; onclick=&quot;alert(1)</div>');
    expect(out).not.toMatch(/<[^>]+onclick=/i);
  });

  it('never turns javascript: URLs in values into links by itself', () => {
    const out = html('Go {url}', { url: 'javascript:alert(1)' });
    expect(out).toBe('<div>Go javascript:alert(1)</div>');
    expect(out).not.toContain('<a');
  });

  it('only allow-listed tags render via handlers', () => {
    const out = html(
      'Save <b>{pct}</b> <i>now</i>',
      { pct: '20%' },
      { b: (c) => createElement('strong', null, c as never) },
    );
    expect(out).toBe('<div>Save <strong>20%</strong> now</div>');
    expect(out).not.toContain('<i>');
    expect(out).not.toContain('<b>');
  });

  it('handles nested and unclosed-looking content safely', () => {
    const out = html('A <b>B <i>C</i></b> D', {}, {
      b: (c) => createElement('b', null, c as never),
    });
    // <i> not allow-listed → children text only inside b
    expect(out).toBe('<div>A <b>B C</b> D</div>');
  });

  it('entity tricks stay as text', () => {
    const out = html('X {v} Y', { v: '&lt;script&gt;' });
    expect(out).toBe('<div>X &amp;lt;script&amp;gt; Y</div>');
  });
});
