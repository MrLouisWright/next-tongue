# Migrating from next-intl

> **Status: planned / pre-release.** Codemods ship in v0.5. See [ROADMAP](../../ROADMAP.md).

```bash
npx tongue migrate next-intl            # dry run, prints diff
npx tongue migrate next-intl --write
```

## What the codemod does

| next-intl | next-tongue | Automated |
|---|---|---|
| `i18n/routing.ts` `defineRouting({...})` | `tongue.config.ts` `defineConfig({...})` (`localePrefix` → `routing.prefix`, `pathnames` kept) | ✅ |
| `createNextIntlPlugin()` in next.config | `withTongue()` | ✅ |
| `middleware.ts`/`proxy.ts` with `createMiddleware(routing)` | `proxy.ts` with `createProxy()` | ✅ |
| `i18n/request.ts` `getRequestConfig` | removed (messages are compiled) | ✅ (custom logic flagged) |
| `NextIntlClientProvider messages={...}` | `TongueProvider locale={locale}` | ✅ |
| `useTranslations('ns')` | `useT('ns')` | ✅ |
| `await getTranslations('ns')` | `await getT(locale, 'ns')` — **needs locale** | ⚠️ inserts `locale` if `params` is in scope, else adds `TODO(tongue)` |
| `getTranslations({ locale, namespace })` | `getT(locale, namespace)` | ✅ |
| `setRequestLocale(locale)` | removed (not needed) | ✅ |
| `getLocale()` / `useLocale()` | params / `useLocale()` from `next-tongue/client` | ⚠️ / ✅ |
| `useFormatter()` / `getFormatter()` | `useFormat()` / `getFormat(locale)` | ✅ |
| `createNavigation(routing)` exports | `next-tongue/navigation` imports | ✅ |
| `t.rich`, `t.markup` | `t.rich` (markup → rich with string tags) | ✅ / ⚠️ |
| `t.raw`, `t.has` | `t.raw` not supported (use structured keys); `t.has` → `t.has` | ⚠️ |
| `global.d.ts` `AppConfig` augmentation | deleted (generated types) | ✅ |

Messages: next-intl JSON is already nested ICU, so files are reused as-is. The codemod reports any key containing `.` or messages that fail strict ICU parsing.

## Manual steps
1. Resolve `TODO(tongue)` comments (mostly passing `locale` into nested server components).
2. Remove `next-intl` and run `npx tongue check`.
3. If you relied on `getLocale()` from headers inside cached components, that code now becomes static — that is the point.

---
[Docs index](../README.md) · [API reference](../api-reference.md) · [Roadmap](../../ROADMAP.md)
