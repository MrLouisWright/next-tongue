# Static export

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

`output: 'export'` produces plain HTML with no server and no proxy. next-tongue supports it with these rules:

1. **Only `routing.prefix: 'always'` is supported.** Proxy/middleware does not run with `output: 'export'` ([Next.js docs](https://nextjs.org/docs/app/guides/static-exports)), so nothing can rewrite `/about` → `/en/about` or redirect `/en/*`.
2. Export `generateStaticParams = localeParams` from `app/[locale]/layout.tsx` (`tongue init --export` writes it); for nested dynamic segments, combine: `localeParams().flatMap(({ locale }) => slugs(locale).map((slug) => ({ locale, slug })))`.
3. `dynamicParams = false` is supported — next-tongue never relies on on-demand rendering of unknown locales (cf. [amannn/next-intl#2060](https://github.com/amannn/next-intl/issues/2060)).
4. The root `/` needs a redirect. `tongue init --export` generates `app/page.tsx` that renders a tiny static page with `<meta http-equiv="refresh">` plus a `<link rel="alternate" hreflang>` list, and optionally a host-level redirect snippet (Netlify `_redirects`, Vercel `vercel.json`, Cloudflare `_redirects`).
5. `localeDetection` has no effect (no proxy). Add a client-side locale switcher.

```ts
// next.config.ts
export default withTongue({ output: 'export', cacheComponents: true });
```

> **Unverified pairing.** `cacheComponents: true` together with `output: 'export'` is checked early in v0.1 ([#15](https://github.com/MrLouisWright/next-tongue/issues/15)). If it does not build on the current 16.x, the export example drops `cacheComponents` and this page will say so.

`withTongue` fails the build if `output: 'export'` is combined with `prefix: 'as-needed' | 'never'` or `domains`.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
