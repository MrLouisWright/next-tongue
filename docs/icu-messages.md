# ICU messages

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

next-tongue uses [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/). Messages are parsed **at build time**; invalid syntax fails the build with file, key and column.

| Syntax | Example | Inferred arg type |
|---|---|---|
| Argument | `Hello {name}` | `name: string \| number` |
| Number | `{n, number}` / `{n, number, ::percent}` / `{n, number, price}` | `n: number \| bigint` |
| Date/time | `{d, date, short}` / `{d, time}` | `d: Date \| number` |
| Plural | `{count, plural, =0 {none} one {# item} other {# items}}` | `count: number` |
| Selectordinal | `{pos, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` | `pos: number` |
| Select | `{gender, select, female {She} male {He} other {They}}` | `gender: 'female' \| 'male' \| (string & {})` |
| Rich tag | `Read <b>this</b>` | `b: (chunks) => ReactNode` (via `t.rich`) |
| Escaping | `'{'literal'}'` | — |

## Plural categories are checked per locale

`tongue check` and the build know CLDR plural rules for each locale. A Polish message missing `few`/`many`, or an English one with a useless `few`, is reported as a **mismatch** (configurable via `strict.mismatch`).

## Compilation

```json
{ "inbox": "{count, plural, =0 {No messages} one {# message} other {# messages}}" }
```
compiles (en) to roughly:
```js
const pr = /*#__PURE__*/ new Intl.PluralRules('en');
export const inbox = ({ count }) =>
  count === 0 ? 'No messages' : pr.select(count) === 'one' ? `${fmtN(count)} message` : `${fmtN(count)} messages`;
```
No parser ships to the browser. See [Architecture](architecture.md).

## Nesting and namespaces

Nested JSON objects become dotted keys and namespaces: `{"home": {"title": "…"}}` → namespace `home`, key `title`, full key `home.title`. Keys may not contain `.`.

## Message descriptions

Add translator context with a sibling `$description`:
```json
{ "save": "Save", "save$description": "Button label in the editor toolbar; max 12 chars" }
```
Used by `tongue translate` and stripped from compiled output.
