# Dev tools: overlay, pseudo-localisation, usage report

> **Status: pre-release.** Overlay (v0.3) and `tongue report` (v0.4) ship. See [ROADMAP](../ROADMAP.md).

All three tools are built in, with zero dependencies ([ADR 0012](adr/0012-zero-dependencies.md)).

## Dev overlay (v0.3)

In `next dev`, `TongueProvider` renders a small panel (toggle with `Alt+Shift+T`) that shows:
- the current locale and time zone;
- **missing keys** rendered on the page (keys that fell back to another locale, or are absent);
- **which messages went to the client** on this route: per-key modules loaded, and namespaces included because `t` escaped a file (`TONGUE_W_ESCAPE`);
- **click-to-key:** with the panel open, enable **Inspect**, then click any translated string to see its key and open its source location (`messages/en.json:12`) via your editor URL (`devOverlay: { editor: 'vscode' }`, or `TONGUE_EDITOR`).

In dev, compiled messages carry key ids that the overlay maps back to strings. The overlay is gated by `process.env.NODE_ENV === 'development'` and is **stripped from production builds**: no overlay code and no key ids in production output (asserted by the client size gate). Disable it with `devOverlay: false` on the provider or in `tongue.config.ts` (pass the resolved flag into `TongueProvider` if you turn it off in config).

## Pseudo-localisation (v0.2)

```ts
// tongue.config.ts
export default defineConfig({ locales: ['en', 'de'], defaultLocale: 'en', pseudo: true });
```

- Adds an `en-XA` pseudo-locale generated from the default locale at codegen time. Visit `/en-XA/...` in dev.
- Strings are **accented** (`Settings` → `[Šéţţîñĝš ···]`) and **expanded** by `expand` (default 35%) to reveal truncation, hard-coded strings and concatenation.
- ICU structure is preserved: arguments, plural/select branches and tags are never altered, only literal text.
- `enabled: 'dev'` (default) excludes the pseudo-locale from production builds; `'always'` keeps it (e.g. for a staging QA build). It is never offered by locale detection.

## Per-route message usage report (v0.4)

```bash
npx next build && npx tongue report
```

Prints, for each route, the number of keys and the bytes (min + gzip) of message code sent to the client, plus namespaces pulled in by escapes or `t.ns`. `--json` for CI; `--max-bytes 4kb` fails when a route exceeds a budget. It reads the client chunks that `next build` wrote and matches next-tongue's per-key module markers; it does not depend on Next internals or manifests.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
