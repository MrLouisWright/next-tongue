# Releasing

## First public beta (`0.9.0`)

The package version on `main` is **0.9.0**. The 4-week API freeze timer in [ROADMAP](../ROADMAP.md) starts when this version is on the npm registry (not merely a git tag).

### Prerequisites

1. npm account with publish rights for the unscoped name `next-tongue` (name is free on the registry as of 2026-10-17).
2. Repo secret `NPM_TOKEN` (Automation token) **or** local `npm login`.
3. Clean tree; CI green on the commit you ship.

### Publish (CI)

1. Add `NPM_TOKEN` under repo Actions secrets.
2. Open the [v0.9.0 GitHub Release](https://github.com/MrLouisWright/next-tongue/releases/tag/v0.9.0) (already created) and ensure it is **Published**, or run **Actions → Publish npm → Run workflow**.
3. Workflow [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) builds, size-checks, and `npm publish --access public`.

### Publish (local)

```bash
pnpm --filter next-tongue run build
pnpm --filter next-tongue run check:deps
pnpm --filter next-tongue run check:size
cd packages/next-tongue && npm publish --access public
```

Git tag `v0.9.0` already exists. After the first successful npm publish, the 4-week freeze timer starts; update [SECURITY.md](../SECURITY.md) when adopters land.

### VS Code extension (#47)

```bash
pnpm --filter next-tongue-vscode run package
# requires publisher tokens:
pnpm --filter next-tongue-vscode run publish:vsce
pnpm --filter next-tongue-vscode run publish:ovsx
```

---
[Docs index](README.md) · [API freeze](api-freeze.md) · [Versioning](versioning.md)
