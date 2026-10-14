> 📄 Mirrors [`docs/icu-messages.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/icu-messages.md) in the main repo — the repo version is canonical.

# ICU messages

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

next-tongue uses [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) with its **own small parser** and a documented subset ([ADR 0010](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0010-own-icu-parser.md)); no third-party parser is used ([ADR 0012](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0012-zero-dependencies.md)). Messages are parsed **at build time**; invalid syntax fails the build with file, key, line and column. The parser is tested against an ICU conformance corpus vendored as test fixtures ([#27](https://github.com/MrLouisWright/next-tongue/issues/27)).

| Syntax | Example | Inferred arg type |
|---|---|---|
| Argument | `Hello {name}` | `name: string \| number` |
| Number | `{n, number}` / `{n, number, ::percent}` / `{n, number, price}` | `n: number \| bigint` |
| Date/time | `{d, date, short}` / `{d, time}` | `d: Date \| number` |
| Plural (incl. `offset:N`, `=N`, `#`) | `{count, plural, offset:1 =0 {none} one {# item} other {# items}}` | `count: number` |
| Selectordinal | `{pos, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` | `pos: number` |
| Select | `{gender, select, female {She} male {He} other {They}}` | `gender: 'female' \| 'male' \| (string & {})` |
| Rich tag | `Read <b>this</b>` | `b: (chunks) => ReactNode` (via `t.rich`) |
| Rich tag (self-closing) | `Line<br/>break` | `br: () => ReactNode` |
| Escaping (apostrophes) | `'{'literal'}'`, `it''s` | — |

## Supported subset

| Area | Supported | Not supported (build error `TONGUE_E_UNSUPPORTED_ICU`) |
|---|---|---|
| Number styles | `integer`, `percent`, `currency` (with config currency), named presets from `formats.number` | other legacy styles |
| Number skeletons | `::percent`, `::currency/XXX`, `::compact-short`, `::compact-long`, `::.00` / `::.##` fraction digits, `::unit/...`, `::sign-always`, `::group-off` | all other skeleton tokens |
| Date/time styles | `short`, `medium`, `long`, `full`, presets from `formats.dateTime` | — |
| Date skeletons | `::yMMMd`-style field skeletons mapped to `Intl.DateTimeFormat` fields | pattern strings (`'yyyy-MM-dd'`) |
| Other | — | `choice`, `spellout`, `ordinal`/`duration` arg types |

## Plural categories are checked per locale

`tongue check` and the build know CLDR plural rules for each locale. A Polish message missing `few`/`many`, or an English one with a useless `few`, is reported as a **mismatch** (configurable via `strict.mismatch`).

## Compilation

```json
{ "inbox": "{count, plural, =0 {No messages} one {# message} other {# messages}}" }
```
compiles (en) to roughly:
```js
let pr; // created lazily on first call, never at module load
export const inbox = ({ count }) =>
  count === 0 ? 'No messages' : (pr ??= new Intl.PluralRules('en')).select(count) === 'one' ? `${fmtN(count)} message` : `${fmtN(count)} messages`;
```
No parser ships to the browser. See [Architecture](Architecture).

## Nesting and namespaces

Nested JSON objects become dotted keys and namespaces: `{"home": {"title": "…"}}` → namespace `home`, key `title`, full key `home.title`. Keys may not contain `.`.

## Message descriptions

Add translator context with a sibling `$description`:
```json
{ "save": "Save", "save$description": "Button label in the editor toolbar; max 12 chars" }
```
Used by `tongue translate` and stripped from compiled output. For screenshots and length limits use `$meta` ([Translator workflow](Translator-Workflow#translator-context)).
