> 📄 Mirrors [`docs/versioning.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/versioning.md) in the main repo — the repo version is canonical.

# Versioning, deprecation, and support

> Applies from **v1.0**. Until then, 0.x minors may include breaking changes (see [CHANGELOG](https://github.com/MrLouisWright/next-tongue/blob/main/CHANGELOG.md)).

## Semantic versioning

From v1.0, next-tongue follows [SemVer](https://semver.org/):

| Change | Bump | Examples |
|---|---|---|
| Bug fix, docs, internal refactor with identical public API | **patch** | Check reporter fix, ICU error message wording |
| New API, new CLI flag, additive config option | **minor** | New `getFormat` helper, optional `routing.*` field |
| Remove or rename a public export; change required config; change CLI exit codes for success paths | **major** | Dropping a previously exported helper |

**Public API** means: package export surfaces, documented `defineConfig` fields, and CLI commands in [CLI](CLI).

## Deprecation policy

1. **Announce** in CHANGELOG under `### Deprecated` and, where practical, a one-time `console.warn` (dev only).
2. **Keep** the deprecated path for at least **one minor** after announcement (two minors when the change is large).
3. **Remove** only in a **major**, listed under `### Removed`.

## Next.js / React support

Per [ADR 0011](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0011-supported-next-versions.md): latest Next.js 16.x + React ≥ 19.2, App Router only. See the [README support policy](https://github.com/MrLouisWright/next-tongue#support-policy).
