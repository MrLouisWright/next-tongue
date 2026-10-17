# Versioning, deprecation, and support

> Applies from **v1.0**. Until then, 0.x minors may include breaking changes (see [CHANGELOG](../CHANGELOG.md)).

## Semantic versioning

From v1.0, [next-tongue](https://www.npmjs.com/package/next-tongue) follows [SemVer](https://semver.org/):

| Change | Bump | Examples |
|---|---|---|
| Bug fix, docs, internal refactor with identical public API | **patch** | Check reporter fix, ICU error message wording |
| New API, new CLI flag, additive config option | **minor** | New `getFormat` helper, optional `routing.*` field |
| Remove or rename a public export; change required config; change CLI exit codes for success paths | **major** | Dropping a previously exported helper |

**Public API** means: package export surfaces (`next-tongue`, `/server`, `/client`, `/proxy`, `/navigation`, `/config`, `/next`, `/testing`), `defineConfig` / `ResolvedTongueConfig` fields that are documented, and CLI commands documented in [CLI](cli.md).

Generated `.tongue/` output and `TongueRegister` shapes may change in a **minor** when message files change; that is expected. Breaking the *shape* of generated helpers without a config/API change is a **major**.

## Deprecation policy

1. **Announce** in CHANGELOG under `### Deprecated` and, where practical, a one-time `console.warn` (dev only) with a link to migration notes.
2. **Keep** the deprecated path for at least **one minor** after announcement (two minors when the change is large).
3. **Remove** only in a **major**, listed under `### Removed`.
4. Deprecations that only affect TypeScript types (aliases) may be removed in the next minor if a type-only re-export remains.

## Next.js / React support

Per [ADR 0011](adr/0011-supported-next-versions.md):

- **Supported:** latest Next.js 16.x minor (`next@^16`), React ≥ 19.2, App Router only.
- **Bundlers:** Turbopack primary; webpack (`next build --webpack`) best-effort but CI-tested.
- **CI:** PRs run `next@latest`; a nightly job builds examples against `next@canary` and opens an issue on breakage (canary failure does not block PRs).
- Older 16.x minors are **best-effort** — upgrade to the latest 16.x for fixes.

The supported range is restated in the [README](../README.md#support-policy) and updated when Next ships a new minor we adopt.

## Security

Report vulnerabilities per [SECURITY.md](../SECURITY.md). Security fixes may ship as patches on the latest major even when they require small API tightening; breaking remediations are called out in the advisory.

---
[Docs index](README.md) · [Roadmap](../ROADMAP.md) · [ADR 0011](adr/0011-supported-next-versions.md)
