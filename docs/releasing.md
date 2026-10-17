# Releasing

## First public beta (`0.9.0`)

The package version on `main` is **0.9.0**. The 4-week API freeze timer in [ROADMAP](../ROADMAP.md) starts when this version is on the npm registry (not merely a git tag).

### Prerequisites

1. npm account with publish rights for `next-tongue`.
2. `npm login` (or `NPM_TOKEN` in the environment).
3. Clean tree; CI green on the commit you ship.

### Publish

```bash
pnpm --filter next-tongue run build
pnpm --filter next-tongue run check:deps
pnpm --filter next-tongue run check:size
cd packages/next-tongue && npm publish --access public
git tag -a v0.9.0 -m "next-tongue 0.9.0"
git push origin v0.9.0
```

After publish: update [SECURITY.md](../SECURITY.md) support table, tick the freeze AC when the 4 weeks elapse, and announce adopters.

### VS Code extension (#47)

```bash
pnpm --filter next-tongue-vscode run package
# requires publisher tokens:
pnpm --filter next-tongue-vscode run publish:vsce
pnpm --filter next-tongue-vscode run publish:ovsx
```

---
[Docs index](README.md) · [API freeze](api-freeze.md) · [Versioning](versioning.md)
