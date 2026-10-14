# API reference

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

Types used below: `Locale` (union of configured locales), `Namespace`, `MessageKey<N?>`, `MessageArgs<K>`, `Href` (internal pathname, typed when `routing.pathnames` is set).

## `next-tongue/config`
| Export | Signature |
|---|---|
| `defineConfig` | `(config: TongueConfig) => TongueConfig` — identity, for type inference. See [Configuration](configuration.md). **Build-time only**: import it only from `tongue.config.ts`. |

## `next-tongue/next`
| Export | Signature |
|---|---|
| `withTongue` | `(nextConfig?: NextConfig, options?: { config?: string }) => NextConfig` — config wrapper, not a bundler plugin: runs codegen (same as `tongue build`) when Next loads its config, registers the per-file call-site loader in `turbopack.rules` and webpack, maps `#tongue/*` to `outDir` (package.json `imports` preferred), starts a single `fs.watch` watcher in dev, and warns when the root `[locale]` layout lacks `generateStaticParams = localeParams`. |

## `next-tongue/proxy`
| Export | Signature |
|---|---|
| `createProxy` | `(options?: { localeDetection?: boolean; resolveLocale?: (req: NextRequest) => Locale \| undefined \| Promise<Locale \| undefined>; onLocale?: (locale: Locale, req: NextRequest) => void }) => (req: NextRequest) => Promise<NextResponse>` — `resolveLocale` (v1.1) runs before detection |
| `verifyLocalePreference` | `(value: string \| undefined, secret: string) => Promise<Locale \| undefined>` — v1.1, see [User preferences](user-preferences.md) |

## `next-tongue/server`
| Export | Signature |
|---|---|
| `getT` | `<N extends Namespace>(locale: Locale, namespace?: N) => Promise<T<N>>` |
| `getFormat` | `(locale: Locale, options?: { timeZone?: string }) => Promise<Format>` — zone defaults to config `timeZone` |
| `isLocale` | `(value: unknown) => value is Locale` |
| `localeParams` | `() => { locale: Locale }[]` — export as `generateStaticParams` from `app/[locale]/layout.tsx` (required for a static shell under `cacheComponents`) |
| `formatMessage` | `(locale: Locale, message: string, values?: Record<string, unknown>) => string` — server-only, untyped, request-time ICU formatting with a bounded LRU; tags stripped unless allow-listed via `formatMessage.rich(locale, message, values, { tags })`. See [Database messages](database-messages.md) |
| `withLocale` | `(action: (locale: Locale, ...args) => R) => (locale: string, ...args) => R` — validates a bound locale, throws `TONGUE_E_LOCALE` |
| `translateIssues` | `<N>(t: T<N>, issues: readonly { message: string; path?: readonly (PropertyKey \| { key: PropertyKey })[]; params?: Record<string, unknown> }[], opts?: { fallback?: MessageKey<N>; formatPath?: (path) => string }) => Record<string, string[]>` — schema-agnostic (Standard Schema-shaped issues) |
| `setLocalePreference` | `(locale: unknown, opts: { secret: string; save?: (l: Locale) => Promise<unknown> }) => Promise<Locale>` — server action helper, v1.1, see [User preferences](user-preferences.md) |
| `createTranslator` | `(locale: Locale) => { t: <N>(ns: N) => Promise<T<N>>; format: () => Promise<Format> }` — binds a locale once per page |
| `LocaleProps` | type: `{ locale: Locale }` for components that receive the locale |
| `generateAlternates` | `(input: { href: Href; locale: Locale; params?: Record<string,string> }) => { canonical: string; languages: Record<Locale \| 'x-default', string> }` |
| `getDir` | `(locale: Locale) => 'ltr' \| 'rtl'` |
| `getOgLocale` | `(locale: Locale) => string` — e.g. `'de-AT'` → `'de_AT'` for `openGraph.locale` |
| `locales`, `defaultLocale` | configured values (`readonly Locale[]`, `Locale`) |

## `next-tongue/client` (all `'use client'`)
| Export | Signature |
|---|---|
| `TongueProvider` | `({ locale: Locale; timeZone?: string; children }) => JSX.Element` |
| `useT` | `<N extends Namespace>(namespace?: N) => T<N>` |
| `useFormat` | `() => Format` |
| `useLocale` | `() => Locale` |
| `translateIssues` | same as the server export |
| `locales`, `defaultLocale` | configured values, inlined at build time |

## `next-tongue/navigation`
| Export | Signature |
|---|---|
| `Link` | `next/link` props with `href: Href \| { pathname: Href; params?; query? }` and optional `locale?: Locale` |
| `redirect`, `permanentRedirect` | `(args: { href: Href \| {...}; locale: Locale }) => never` |
| `LocaleSwitcher` / `useLocaleSwitcher` | headless, accessible switcher: `({ children: (options: { locale, label, href, current }[]) => ReactNode })`; keeps the page, persists the choice (v0.3, [#44](https://github.com/MrLouisWright/next-tongue/issues/44)) |
| `useRouter` | `() => { push(href, { locale?, scroll? }), replace(href, { locale?, scroll? }), prefetch(href, { locale? }), back, forward, refresh }` |
| `usePathname` | `() => Href` (locale prefix and localized segments removed) |
| `getPathname` | `(args: { href; locale: Locale }) => string` |

## The translator `T<N>`
| Member | Signature |
|---|---|
| `t(key, args?)` | `string` — `args` required iff the message has arguments |
| `t.rich(key, args)` | `ReactNode` — tag args are `(chunks: ReactNode) => ReactNode` |
| `t.has(key)` | `boolean` |
| `t.dynamic(key, { from: Key[] }, args?)` | `string` — non-literal key from a declared key set; only those keys ship |
| `t.ns(namespace)` | `T<N>` — translator for a whole namespace, for keys only known at runtime; the namespace module ships |

## `Format`
All methods use built-in `Intl`, with instances created lazily and cached per locale + options. Typed helpers land in v0.2 ([#45](https://github.com/MrLouisWright/next-tongue/issues/45)).

| Method | Signature |
|---|---|
| `number` | `(value: number \| bigint, preset \| Intl.NumberFormatOptions?) => string` |
| `dateTime` | `(value: Date \| number, preset \| Intl.DateTimeFormatOptions?) => string` — zone from config/provider |
| `relativeTime` | `(value: Date \| number, now: Date \| number, options?: Intl.RelativeTimeFormatOptions & { unit?: Intl.RelativeTimeFormatUnit }) => string` — explicit `now`, never `Date.now()` |
| `list` | `(items: readonly string[], options?: Intl.ListFormatOptions) => string` |
| `unit` | `(value: number, unit: SanctionedUnit, options?: { unitDisplay?: 'short' \| 'long' \| 'narrow' }) => string` — `SanctionedUnit` is the typed ECMA-402 unit list (and `a-per-b` combinations) |
| `displayName` | `(code: string, options: { type: 'language' \| 'region' \| 'script' \| 'currency' \| 'calendar' }) => string` — e.g. `'de'` → `Deutsch` in `de` |

## `next-tongue/testing`
| Export | Signature |
|---|---|
| `createTestT` | `(locale: Locale, namespace?: Namespace, opts?: { keysOnly?: boolean }) => T` (sync) |
| `TongueTestProvider` | `({ locale; keysOnly?; children })` |

## CLI
See [CLI](cli.md): `tongue build | init | extract | check | translate | export | import | report` (`migrate` after v1.0). Node built-ins only.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
