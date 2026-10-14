# Static export

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

`output: 'export'` produces plain HTML with no server and no proxy. next-tongue supports it with these rules:

1. Use `routing.prefix: 'always'` (recommended). There is no proxy to rewrite `/about` → `/en/about`.
2. Export `generateStaticParams = localeParams` in `app/[locale]/layout.tsx`; for nested dynamic segments, combine: `localeParams().flatMap(({ locale }) => slugs(locale).map((slug) => ({ locale, slug })))`.
3. `dynamicParams = false` is supported — next-tongue never relies on on-demand rendering of unknown locales (cf. [amannn/next-intl#2060](https://github.com/amannn/next-intl/issues/2060)).
4. The root `/` needs a redirect. `tongue init --export` generates `app/page.tsx` that renders a tiny static page with `<meta http-equiv="refresh">` plus a `<link rel="alternate" hreflang>` list, and optionally a host-level redirect snippet (Netlify `_redirects`, Vercel `vercel.json`, Cloudflare `_redirects`).
5. `localeDetection` has no effect (no proxy). Add a client-side locale switcher.

```ts
// next.config.ts
export default withTongue({ output: 'export', cacheComponents: true });
```

`withTongue` warns at build time if `output: 'export'` is combined with `prefix: 'as-needed' | 'never'` or `domains`.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
