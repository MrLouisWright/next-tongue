# 0013. Database and CMS messages

- Status: Accepted
- Date: 2026-10-14
- Supersedes: the v1 non-goal "runtime-loaded catalogs from a CMS" (README, FAQ, [research](../research.md) rejected list, [ADR 0001](0001-compile-messages-at-build-time.md) consequence)

## Context
Many teams keep some or all translations in a database or headless CMS so that editors can change copy without a code change. The original plan rejected this because it conflicts with compile-time messages ([ADR 0001](0001-compile-messages-at-build-time.md)). Two narrow mechanisms can support it without shipping catalogs to the client and with zero dependencies ([ADR 0012](0012-zero-dependencies.md)).

## Decision
1. **Build-time sources** (v0.4, [#33](https://github.com/MrLouisWright/next-tongue/issues/33)). `defineConfig({ sources: [async () => fetchFromDb()] })`. Each source resolves to `{ [locale]: { [namespace]: { [key]: icuString } } }`. `tongue build` (and `withTongue`) awaits all sources, merges them with file messages (later sources override files; conflicts are reported), then validates, compiles and types them like any other message. A source that fails or times out fails the build unless `sourcesOnError: 'use-cache'` reuses the last successful snapshot in `.tongue/sources.json`.
2. **Request-time server formatting** (v0.2, [#34](https://github.com/MrLouisWright/next-tongue/issues/34)). `formatMessage(locale, icuString, values)` in `next-tongue/server`, server-only:
   - parses with next-tongue's own parser ([ADR 0010](0010-own-icu-parser.md)) and keeps compiled messages in a bounded LRU (configurable size, keyed by locale + message string);
   - returns an **untyped** string;
   - is pure (no request data), so it works inside `'use cache'`; the caller's DB/CMS fetch decides cacheability;
   - treats rich-text tags safely: by default tags are stripped and their text kept; with a `tags` map only listed tags render via the supplied functions; output is never raw HTML, and values are inserted as text.
3. Neither mechanism sends a catalog to the browser. Client components receive rendered strings as props ([ADR 0009](0009-client-message-delivery.md)).

## Consequences
- \+ Editors can own copy; build-time sources keep full types and validation.
- \+ Request-time formatting covers copy that must change without a rebuild.
- − Build-time sources need a rebuild or redeploy to change; see [Database messages](../database-messages.md) for revalidation guidance.
- − Request-time messages are untyped and validated only at render time; invalid ICU throws `TONGUE_E_ICU_SYNTAX`.
- − The parser runs on the server at request time (never on the client).

## Alternatives considered
- Runtime client catalogs: conflicts with ADR 0009 and the core promise ([#20](https://github.com/MrLouisWright/next-tongue/issues/20)).
- Keep it a non-goal: rejected by the maintainer.
