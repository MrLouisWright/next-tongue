# Translator workflow: XLIFF and CSV (v0.4)

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

For teams that work with translators or a TMS, `tongue export` and `tongue import` round-trip messages through **XLIFF 2.0** or **CSV**. Both are implemented with Node built-ins only ([ADR 0012](adr/0012-zero-dependencies.md)).

```bash
npx tongue export --format xliff --locale de,fr --out ./translations   # one de.xlf, fr.xlf per locale
npx tongue export --format csv --locale de --missing-only              # only untranslated/stale keys
npx tongue import ./translations/de.xlf                                # validates, then merges into messages/de.json
```

- **XLIFF 2.0:** one `<unit id="home.inbox">` per key with `<source>` (default locale) and `<target>`. ICU placeholders and tags are kept as text; `$description` becomes a `<note>`. `state` reflects `tongue.lock` (`initial`, `translated`, `final`).
- **CSV:** columns `key,description,source,target`, UTF-8 with BOM, RFC 4180 quoting.
- **Import** checks every target with the same validation as the build (ICU parse, arg/tag parity, CLDR plurals). Invalid rows are reported with `file:line` and not written. `--dry-run` prints the diff. Imported entries update `tongue.lock`, so `tongue check` stops reporting them as stale.
- Stale targets (source changed since translation, per the hashes in `tongue.lock`) are exported with `state="initial"` and included by `--missing-only` ([#42](https://github.com/MrLouisWright/next-tongue/issues/42)).
- Keys from build-time `sources` ([Database messages](database-messages.md)) are exported read-only (`translate="no"` / a `readonly` column) and never imported into files.

## Translator context

Give translators what they need next to each key with a sibling `$meta` (`$description` remains a shorthand):

```json
{
  "save": "Save",
  "save$meta": {
    "description": "Button label in the editor toolbar",
    "screenshot": "https://example.com/shots/editor-toolbar.png",
    "maxLength": 12
  }
}
```
- Fed into `tongue translate` prompts and `tongue export` (XLIFF `<note>`s and `size-restriction`; CSV `description`, `screenshot`, `maxLength` columns).
- `tongue check` reports targets longer than `maxLength` (`length` check).
- Stripped from compiled output ([#43](https://github.com/MrLouisWright/next-tongue/issues/43)).

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
