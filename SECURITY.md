# Security policy

## Supported versions
Once on npm, the latest minor of the latest major receives security fixes. Until `0.9.0` is published, treat `main` as the only supported line.

| Version | Supported |
|---|---|
| `0.9.x` (when published) | ✅ |
| `main` (pre-publish / unreleased commits) | ✅ best effort |

## Reporting a vulnerability
Please **do not open a public issue.** Use GitHub's [private vulnerability reporting](https://github.com/MrLouisWright/next-tongue/security/advisories/new). You'll get an acknowledgement within 7 days and a fix or mitigation plan within 30 days for confirmed issues. Credit is given in the advisory unless you prefer otherwise.

## Threat model

| Asset | Trust boundary | Threat | Mitigation |
|---|---|---|---|
| Rendered HTML | Message files, `sources` and `formatMessage` strings (DB/CMS) → React | XSS via rich-text tags or values | Messages never produce raw HTML; tags render only through supplied functions (allow-list for `formatMessage.rich`); values are inserted as text. XSS corpus in CI ([#46](https://github.com/MrLouisWright/next-tongue/issues/46)) |
| Generated modules | Message content → JS codegen | Code injection | All content escaped as string literals; fuzz tests |
| Routing | URL, cookies, `Accept-Language`, action arguments → locale | Path traversal (`../`, `%2e%2e`, NUL), CRLF/header injection in `Location` or `Set-Cookie`, open redirect, locale spoofing | A locale is accepted only if it exactly matches a configured BCP 47 tag; redirects are built from the configured table and stay same-origin; cookie values are never echoed raw |
| User preference cookie | Browser → proxy | Tampering | HMAC-SHA-256 signature (Web Crypto), constant-time verification; invalid values ignored ([user preferences](docs/user-preferences.md)) |
| Cached output | Request data → `'use cache'` | Cross-user leakage | next-tongue reads no headers/cookies outside `proxy.ts` and action helpers; the locale is a plain cache key |
| LLM API key | Env → `tongue translate` | Leakage via logs, lockfile, errors | Read from env only; redaction tests |
| Repository files | LLM output and imports (XLIFF/CSV) → `messages/` | Writes outside the project, prompt injection | Writes only to configured message paths; outputs ICU-validated |
| Supply chain | npm → users | Compromised dependency | Zero dependencies ([ADR 0012](docs/adr/0012-zero-dependencies.md)); CI dependency budget |

## Scope of particular interest
- `proxy.ts` handling: open redirects, header/cookie injection, locale spoofing.
- Build-time compiler: code injection via message content into generated modules (messages are escaped; any bypass is critical).
- `tongue translate`: API key leakage (logs, lockfile, errors), prompt injection from message content that causes writes outside `messages/`.
- Codemods writing outside the project directory.
- `formatMessage` or database strings producing markup.

## CLI security review (v0.9)

Reviewed 2026-10-17 against the threat model above. Findings and controls:

| Command | Risk | Control |
|---|---|---|
| `tongue translate` | API key in logs/lockfile; writes outside `messages/` | Key read from env only; redaction tests; ICU parity gate; all writes via `resolveInsideProject` |
| `tongue migrate` | Codemod overwrite / path escape | `--dry-run`; writes limited to walked source under cwd; report path gated by `resolveInsideProject` |
| `tongue export` / `import` | Escape via `--out` / file path | `resolveInsideProject` on out dir and import file |
| `tongue init` / `extract` | Scaffold / message overwrite | Init paths gated; extract only rewrites the configured default-locale messages file |
| `tongue check` / `report` / `build` | Read-only / codegen under `outDir` | No network; codegen stays in configured `outDir` |

Shared helper: `packages/next-tongue/src/cli/safe-path.ts` (`resolveInsideProject`). Unit tests cover `..` traversal and absolute escapes.
