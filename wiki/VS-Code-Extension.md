> 📄 Mirrors [`docs/vscode.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/vscode.md) in the main repo — the repo version is canonical.

# VS Code extension (v1.1)

> **Status: planned, after v1.0** ([#47](https://github.com/MrLouisWright/next-tongue/issues/47)). See [ROADMAP](Roadmap).

A separate package, `packages/vscode`, in this repo. It depends only on the VS Code extension API (no other runtime dependencies) and reads the generated `.tongue/manifest.json`, so it never re-parses your app.

- **Inline previews:** the default-locale string shown next to `t('key')`.
- **Diagnostics:** missing keys and argument mismatches, using the same rules as `tongue check`.
- **Go-to-message:** jump from `t('home.inbox')` to `messages/en.json`.
- **Hover:** the message in every locale, with its `$meta` description and max length.
