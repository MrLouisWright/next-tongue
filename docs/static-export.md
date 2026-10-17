# Static export

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

`output: 'export'` produces plain HTML with no server and no proxy. next-tongue supports it with these rules:

1. **Only `routing.prefix: 'always'` is supported.** Proxy/middleware does not run with `output: 'export'` ([Next.js docs](https://nextjs.org/docs/app/guides/static-exports)), so nothing can rewrite `/about` → `/en/about` or redirect `/en/*`.
2. Export `generateStaticParams = localeParams` from `app/[locale]/layout.tsx` (`tongue init --export` writes it); for nested dynamic segments, combine: `localeParams().flatMap(({ locale }) => slugs(locale).map((slug) => ({ locale, slug })))`.
3. `dynamicParams = false` is supported — next-tongue never relies on on-demand rendering of unknown locales (cf. [amannn/next-intl#2060](https://github.com/amannn/next-intl/issues/2060)).
4. The root `/` needs a redirect. `tongue init --export` generates `app/page.tsx` that renders a tiny static page with `<meta http-equiv="refresh">` plus a `<link rel="alternate" hreflang>` list, and optionally a host-level redirect snippet (Netlify `_redirects`, Vercel `vercel.json`, Cloudflare `_redirects`).
5. `localeDetection` has no effect (no proxy). Add a client-side locale switcher.

```ts
// next.config.ts — do NOT enable cacheComponents here
export default withTongue({ output: 'export' });
```

> **Verified (Next.js 16.4.2):** `cacheComponents: true` + `output: 'export'` **does not build** (`Invariant: PPR cannot be enabled in export mode`). See [`examples/cache-export-probe/RESULT.md`](../examples/cache-export-probe/RESULT.md). The static-export example therefore omits Cache Components; use `examples/cache-components` when you need PPR/static shells.

`withTongue` warns if `output: 'export'` is combined with `prefix` other than `'always'` or with `domains`.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
