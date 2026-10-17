# VS Code extension (v1.1)

> **Status: implemented (pre-release, unpublished).** Package at `packages/vscode` ([#47](https://github.com/MrLouisWright/next-tongue/issues/47)). Marketplace / Open VSX publish follows. See [ROADMAP](../ROADMAP.md).

A separate package, `packages/vscode`, in this repo. It depends only on the VS Code extension API (no other runtime dependencies) and reads the generated `.tongue/manifest.json` (including per-locale `byLocale` strings), so it never re-parses your app source for catalogs.

- **Inline previews:** Inlay hints with the default-locale string next to `t('key')`.
- **Diagnostics:** Unknown keys (missing from the manifest).
- **Go-to-message:** Jump from `t('title')` / `t('home.inbox')` to the default-locale JSON line.
- **Hover:** The message in every locale from the manifest.

### Local install (dev)
```bash
pnpm --filter next-tongue-vscode run build
# Then in VS Code: "Developer: Install Extension from Location…" → packages/vscode
```

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
