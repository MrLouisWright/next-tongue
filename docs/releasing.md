# Releasing

## First public beta (`0.9.0`)

The package version on `main` is **0.9.0**. The 4-week API freeze timer in [ROADMAP](../ROADMAP.md) starts when this version is on the npm registry (not merely a git tag).

### Prerequisites

1. npm account with publish rights for the unscoped name `next-tongue` (name is free on the registry as of 2026-10-17).
2. Repo secret `NPM_TOKEN` (Automation token) **or** local `npm login`.
3. Clean tree; CI green on the commit you ship.

### Publish (local) — current status

`next-tongue@0.9.0` was submitted on 2026-10-17 and is in npm **staged publishing** (placeholder `0.0.0-stage` is live; real tarball waits for 2FA approval).

**Approve (required once):**

1. Open [npm Staged Packages](https://www.npmjs.com/settings/~/packages) → **Staged Packages** for `next-tongue@0.9.0`, or
2. With npm ≥ 11.15 / Node ≥ 22.14: `npm stage approve next-tongue@0.9.0` (prompts for 2FA).

Until approved, `npm install next-tongue` resolves the inert placeholder — do not point adopters at the registry yet.

### Publish (CI)

1. Repo secret `NPM_TOKEN` (Automation token) — already used for the first stage.
2. Workflow [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs `npm publish` on release / workflow_dispatch; for brand-new names the registry may still stage, so a maintainer 2FA approve remains required.
3. After approve, the 4-week freeze timer starts; update [SECURITY.md](../SECURITY.md).

### VS Code extension (#47)

```bash
pnpm --filter next-tongue-vscode run package
# requires publisher tokens:
pnpm --filter next-tongue-vscode run publish:vsce
pnpm --filter next-tongue-vscode run publish:ovsx
```

---
[Docs index](README.md) · [API freeze](api-freeze.md) · [Versioning](versioning.md)
