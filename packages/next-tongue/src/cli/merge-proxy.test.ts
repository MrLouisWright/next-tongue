import { describe, expect, it } from 'vitest';
import { mergeProxySource } from './merge-proxy.js';

const opts = {
  locales: ['en', 'de'] as const,
  defaultLocale: 'en',
  prefix: 'as-needed',
};

describe('mergeProxySource', () => {
  it('leaves files that already call createProxy', () => {
    const src = `import { createProxy } from 'next-tongue/proxy';
export const proxy = createProxy({ locales: ['en'], defaultLocale: 'en' });
`;
    const r = mergeProxySource(src, opts);
    expect(r.status).toBe('unchanged');
  });

  it('replaces NextResponse.next() with tongue(req)', () => {
    const src = `import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  return NextResponse.next();
}
`;
    const r = mergeProxySource(src, opts);
    expect(r.status).toBe('merged');
    if (r.status !== 'merged') return;
    expect(r.code).toContain("from 'next-tongue/proxy'");
    expect(r.code).toContain('const tongue = createProxy({');
    expect(r.code).toContain('locales: ["en","de"]');
    expect(r.code).toContain('return tongue(req)');
    // Early allow-list next() kept; only the final one becomes tongue()
    expect(r.code).toMatch(/startsWith\('\/api'\)[\s\S]*return NextResponse\.next\(\)/);
    expect(r.code.match(/return tongue\(req\)/g)?.length).toBe(1);
  });

  it('wraps a handler that has no NextResponse.next()', () => {
    const src = `import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
  if (!req.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return new Response('ok');
}
`;
    const r = mergeProxySource(src, opts);
    expect(r.status).toBe('merged');
    if (r.status !== 'merged') return;
    expect(r.code).toContain('function __tongue_user_proxy');
    expect(r.code).toContain('export async function proxy');
    expect(r.code).toContain("x-middleware-next') !== '1'");
    expect(r.code).toContain('return tongue(req)');
  });

  it('uses __tongueProxy when tongue is already bound', () => {
    const src = `const tongue = 'nope';
import { NextResponse, type NextRequest } from 'next/server';
export function proxy(req: NextRequest) {
  return NextResponse.next();
}
`;
    const r = mergeProxySource(src, opts);
    expect(r.status).toBe('merged');
    if (r.status !== 'merged') return;
    expect(r.code).toContain('const __tongueProxy = createProxy({');
    expect(r.code).toContain('return __tongueProxy(req)');
  });
});
