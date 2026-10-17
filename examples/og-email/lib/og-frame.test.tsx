import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { OgFrame } from './og-frame.js';

describe('OgFrame RTL snapshot (#39)', () => {
  it('sets dir=rtl for Arabic', () => {
    const html = renderToStaticMarkup(
      createElement(OgFrame, { locale: 'ar', title: 'مرحباً بك في next-tongue' }),
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-dir="rtl"');
    expect(html).toMatchInlineSnapshot(
      `"<div dir="rtl" data-testid="og-frame" data-dir="rtl" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:64px;background:#0f172a;color:#f8fafc;padding:48px">مرحباً بك في next-tongue</div>"`,
    );
  });

  it('sets dir=ltr for English', () => {
    const html = renderToStaticMarkup(
      createElement(OgFrame, { locale: 'en', title: 'Welcome' }),
    );
    expect(html).toContain('dir="ltr"');
  });
});
