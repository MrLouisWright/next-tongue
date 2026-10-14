# API reference

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

Types used below: `Locale` (union of configured locales), `Namespace`, `MessageKey<N?>`, `MessageArgs<K>`, `Href` (internal pathname, typed when `routing.pathnames` is set).

## `next-tongue/config`
| Export | Signature |
|---|---|
| `defineConfig` | `(config: TongueConfig) => TongueConfig` — identity, for type inference. See [Configuration](configuration.md). |

## `next-tongue/plugin`
| Export | Signature |
|---|---|
| `withTongue` | `(nextConfig?: NextConfig, options?: { config?: string }) => NextConfig` — registers the compiler (Turbopack and webpack), aliases `#tongue/*` to `outDir`, watches message files in dev. |

## `next-tongue/proxy`
| Export | Signature |
|---|---|
| `createProxy` | `(options?: { localeDetection?: boolean; onLocale?: (locale: Locale, req: NextRequest) => void }) => (req: NextRequest) => Promise<NextResponse>` |

## `next-tongue/server`
| Export | Signature |
|---|---|
| `getT` | `<N extends Namespace>(locale: Locale, namespace?: N) => Promise<T<N>>` |
| `getFormat` | `(locale: Locale) => Promise<Format>` |
| `isLocale` | `(value: unknown) => value is Locale` |
| `localeParams` | `() => { locale: Locale }[]` — use as `generateStaticParams` |
| `generateAlternates` | `(input: { href: Href; locale: Locale; params?: Record<string,string> }) => { canonical: string; languages: Record<Locale \| 'x-default', string> }` |
| `getDir` | `(locale: Locale) => 'ltr' \| 'rtl'` |
| `locales`, `defaultLocale` | configured values (`readonly Locale[]`, `Locale`) |

## `next-tongue/client` (all `'use client'`)
| Export | Signature |
|---|---|
| `TongueProvider` | `({ locale: Locale; children }) => JSX.Element` |
| `useT` | `<N extends Namespace>(namespace?: N) => T<N>` |
| `useFormat` | `() => Format` |
| `useLocale` | `() => Locale` |

## `next-tongue/navigation`
| Export | Signature |
|---|---|
| `Link` | `next/link` props with `href: Href \| { pathname: Href; params?; query? }` and optional `locale?: Locale` |
| `redirect`, `permanentRedirect` | `(args: { href: Href \| {...}; locale: Locale }) => never` |
| `useRouter` | `() => { push, replace, prefetch(href, { locale? }), back, forward, refresh }` |
| `usePathname` | `() => Href` (locale prefix and localized segments removed) |
| `getPathname` | `(args: { href; locale: Locale }) => string` |

## The translator `T<N>`
| Member | Signature |
|---|---|
| `t(key, args?)` | `string` — `args` required iff the message has arguments |
| `t.rich(key, args)` | `ReactNode` — tag args are `(chunks: ReactNode) => ReactNode` |
| `t.has(key)` | `boolean` |
| `t.dynamic(key: string, args?)` | `string` — untyped escape hatch; includes the whole namespace in the client bundle |

## `Format`
`number(value, preset \| Intl.NumberFormatOptions?)`, `dateTime(value, preset \| options?)`, `relativeTime(value, now, options?)`, `list(items, options?)`.

## `next-tongue/testing`
| Export | Signature |
|---|---|
| `createTestT` | `(locale: Locale, namespace?: Namespace, opts?: { keysOnly?: boolean }) => T` (sync) |
| `TongueTestProvider` | `({ locale; keysOnly?; children })` |

## CLI
See [CLI](cli.md): `tongue init | extract | check | translate | migrate`.
