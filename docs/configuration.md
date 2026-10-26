# Configuration

> **Status: beta 0.9 (API freeze).** Install `next-tongue` from npm. See [ROADMAP](../ROADMAP.md) and [API freeze](api-freeze.md).

All options live in `tongue.config.ts` at the project root. It is read at build time by `withTongue` and the CLI (`tongue build`), and a serialisable subset (locales, default locale, routing) is inlined into the proxy and runtime — the config file itself is never shipped to the browser.

## Full shape

```ts
import { defineConfig } from 'next-tongue/config';

export default defineConfig({
  // Required
  locales: ['en', 'de', 'fr'],          // BCP 47 tags; order is used for hreflang and localeParams()
  defaultLocale: 'en',                  // must be in locales; the source language for extract/translate

  // Messages
  messages: './messages/{locale}.json', // or './messages/{locale}/{namespace}.json'
  fallback: { 'de-AT': 'de' },          // per-locale fallback chain; ends at defaultLocale (default: CLDR parents)
  timeZone: 'Europe/Berlin',            // zone for static/server date formatting (default: 'UTC'), see ADR 0008
  sources: [async () => fetchFromDb()], // build-time DB/CMS messages, merged with files (v0.4), see database-messages.md
  sourcesOnError: 'fail',               // 'fail' | 'use-cache'
  pseudo: { locale: 'en-XA', enabled: 'dev', expand: 0.35 }, // pseudo-localisation (v0.2), see dev-tools.md

  // Client delivery (ADR 0009)
  client: { split: 'none' },            // 'none' (all locales of used keys) | 'locale' (opt-in, later)
  devOverlay: { editor: 'vscode' },     // or false; Alt+Shift+T panel, stripped from production (v0.3)

  // Routing (see routing-and-proxy.md)
  routing: {
    prefix: 'as-needed',                // 'always' | 'as-needed' | 'never'   (default: 'as-needed')
    localeDetection: true,              // Accept-Language + cookie, in proxy.ts only (default: true)
    localeCookie: { name: 'TONGUE_LOCALE', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' }, // or false
    domains: [                          // optional, overrides prefix per domain
      { domain: 'example.de', defaultLocale: 'de', locales: ['de'] },
    ],
    pathnames: {                        // optional localized pathnames
      '/about': { de: '/ueber-uns', fr: '/a-propos' },
    },
  },

  // Formatting presets used by getFormat()/useFormat() and ICU {x, number, ::preset}
  formats: {
    number: { price: { style: 'currency', currency: 'EUR' } },
    dateTime: { short: { dateStyle: 'medium' } },
  },

  // Compiler
  outDir: '.tongue',                    // generated modules + types (default: '.tongue')
  strict: {
    missing: 'error',                   // 'error' | 'warn' | 'off'  — key missing in a locale
    unused: 'warn',                     // key never referenced in source
    mismatch: 'error',                  // ICU args/plural categories differ from defaultLocale
    a11y: 'error',                      // missing <html lang>/dir (tongue check, v0.4)
    bidi: 'warn',                       // bidi issues in RTL messages (tongue check, v0.4)
    stale: 'warn',                      // source changed since translation (tongue.lock hashes)
    length: 'warn',                     // target longer than $meta.maxLength (v0.4)
  },

  // CLI: tongue update / translate via Loomlocale (see ai-translation.md)
  translate: {
    glossary: './tongue.glossary.json',
    lockfile: './tongue.lock',
    context: 'A B2B invoicing app. Formal tone (Sie in German).',
    maxChars: 200_000,                  // billable-character budget per run (also --max-chars)
  },
  cloud: {
    projectId: 'prj_123',               // written by `tongue link`
    // files: ['./locales/{locale}/*.json'], // dictionary patterns (default: messages)
    // baseURL: 'https://loomlocale.com/api/v1',
  },
});
```

## Option reference

| Option | Type | Default | Notes |
|---|---|---|---|
| `locales` | `readonly string[]` | — (required) | Validated as BCP 47. Becomes the `Locale` union type. |
| `defaultLocale` | `Locale` | — (required) | |
| `messages` | `string` | `'./messages/{locale}.json'` | Must contain `{locale}`; may contain `{namespace}`. JSON in v0.1; JSONC and YAML are under consideration for v0.3. |
| `fallback` | `Partial<Record<Locale, Locale>>` | CLDR parent locales | Resolved at compile time — missing keys are filled from the chain, so there is no runtime lookup. Without an entry, a locale falls back along CLDR parent locales (`de-AT → de`, `zh-Hant-HK → zh-Hant`, never across scripts such as `zh-Hant → zh-Hans`), then `defaultLocale`. Explicit entries override. |
| `timeZone` | IANA zone string | `'UTC'` | Passed explicitly to every `Intl.DateTimeFormat`; the server's default zone is never used. Override per call with `getFormat(locale, { timeZone })` or per subtree with `<TongueProvider timeZone>`. See [ADR 0008](adr/0008-explicit-time-zone.md). |
| `sources` | `Array<() => Promise<Record<Locale, Record<string, Record<string, string>>>>>` | `[]` | Build-time database/CMS messages, merged after files in order, then compiled and typed. See [Database messages](database-messages.md). |
| `sourcesOnError` | `'fail' \| 'use-cache'` | `'fail'` | `'use-cache'` reuses `.tongue/sources.json` from the last successful build. |
| `pseudo` | `{ locale?: string; enabled?: 'dev' \| 'always' \| false; expand?: number } \| boolean` | `false` | Adds a pseudo-locale (default `en-XA`) generated from `defaultLocale`; `true` = `{ locale: 'en-XA', enabled: 'dev', expand: 0.35 }`. Never part of `localeParams()` in production unless `'always'`. See [Dev tools](dev-tools.md). |
| `client.split` | `'none' \| 'locale'` | `'none'` | `'locale'` (opt-in, after the benchmark) splits per-key modules per locale with dynamic imports; see [ADR 0009](adr/0009-client-message-delivery.md). |
| `devOverlay` | `boolean \| { editor?: string }` | `true` (→ `{ editor: 'vscode' }`) | Dev-only overlay (`Alt+Shift+T`); `false` disables. `editor` is a preset (`vscode`/`cursor`/`webstorm`) or a `{file}`/`{line}` template; `TONGUE_EDITOR` overrides. Never included in production builds. See [Dev tools](dev-tools.md). |
| `routing.prefix` | `'always' \| 'as-needed' \| 'never'` | `'as-needed'` | `'as-needed'` redirects `/{defaultLocale}/*` to `/*`. `'never'` (v0.4) requires cookie- or domain-based routing. `output: 'export'` supports only `'always'`. |
| `routing.localeDetection` | `boolean` | `true` | Only the proxy reads headers/cookies. |
| `routing.localeCookie` | `{ name, maxAge, sameSite?, secure?, path? } \| false` | `{ name: 'TONGUE_LOCALE', maxAge: 1y, sameSite: 'lax', path: '/' }` | `sameSite: 'strict'` is allowed but discouraged: the cookie is then not sent on cross-site navigation, so returning visitors from external links get the detected locale instead of the one they chose ([next-international#453](https://github.com/QuiiBz/next-international/issues/453)). `secure` defaults to `true` on HTTPS. |
| `routing.domains` | `DomainConfig[]` | `undefined` | |
| `routing.pathnames` | `Record<string, Partial<Record<Locale, string>>>` | `undefined` | Typed: `Link href` only accepts known internal pathnames when set. |
| `routing.rootParams` | `boolean` | `false` | Opt-in `getT(ns)` / `getFormat()` via `next/root-params` (ADR 0007). `withTongue` sets `experimental.rootParams`. Prefer Next ≥ 16.3.8; avoid with two sibling root layouts until [vercel/next.js#96756](https://github.com/vercel/next.js/issues/96756). |
| `formats` | `{ number?, dateTime?, list? }` | `{}` | `Intl` options by preset name. |
| `outDir` | `string` | `'.tongue'` | Git-ignore it. |
| `scan.include` | `string[]` | `[]` (→ app, src, components, lib, server, actions) | Roots for `tongue check` / `extract` key scanning. Set explicitly if messages are referenced from other dirs. |
| `strict.*` | `'error' \| 'warn' \| 'off'` | see above | Used by both the build and `tongue check`. |
| `strict.unusedIgnore` | `string[]` | `[]` | Full keys or globs (`common.*`) skipped by unused warnings. Prefer catalog `$meta.planned` / `@tongue-ignore` when the key is intentionally reserved — see [Translator workflow](translator-workflow.md#translator-context). |
| `translate.*` | object | `undefined` | Only read by `tongue translate`. |

## `withTongue` and Turbopack / TypeScript

`withTongue(nextConfig)`:

- Runs `tongue build` when Next loads config.
- Sets `turbopack.resolveAlias['#tongue']` and **appends** a call-site loader to `turbopack.rules['*.tsx']` / `['*.jsx']` (and a webpack pre-loader). Existing rules for those globs are kept (merged into an array).
- The same loader rules apply to **production** client (and SSR) bundles — “works in `next dev`” without `withTongue()` does **not** mean Vercel/`next build` rewrote `useT` / `t.dynamic`. Always wrap `next.config` with `withTongue`.
- Expects `#tongue/*` resolution via package.json `imports` (`"./.tongue/*.js"` — Node needs the suffix) **and** `tsconfig` `paths` (`"./.tongue/*"`). TypeScript does not use `imports` alone.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `LOOMLOCALE_TOKEN` | `tongue update` / `translate` / `push` / `pull` | Loomlocale token for CI (overrides `tongue login`) |
| `LOOMLOCALE_API_URL` | Loomlocale commands | API base URL override |
| `TONGUE_DEBUG=1` | `withTongue`, CLI | Verbose compiler logs |

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
