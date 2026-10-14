# Contributing to next-tongue

Thanks for your interest! next-tongue is **pre-alpha**: there is no library code yet. The most valuable contributions right now are:

1. **Design feedback** on the planned API ([docs](docs/README.md)) and [ADRs](docs/adr/README.md) — open an issue with the `type: design` template.
2. **Real-world requirements** — tell us about your Next.js 16 i18n setup and what breaks today.
3. **Picking up a roadmap issue** in [v0.1](https://github.com/MrLouisWright/next-tongue/milestone/1) once scaffolding lands.

## Ground rules
- Be kind; we follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Discuss significant changes in an issue before a PR. Changes to core principles need an ADR (`docs/adr/template.md`).
- Docs and code must stay consistent: if a PR changes an API, it updates `docs/api-reference.md` and every affected guide.

## Development (planned, from v0.1)
```bash
pnpm install
pnpm test          # vitest
pnpm typecheck     # tsc + type tests
pnpm lint
pnpm e2e           # playwright against examples/
pnpm changeset     # describe your change
```
Repo layout (planned): `packages/next-tongue` (runtime + plugin), `packages/compiler`, `packages/cli`, `examples/*`, `docs/`.

## Pull requests
- One logical change per PR; link the issue (`Closes #123`).
- Add tests (unit, type tests, e2e as relevant) and a changeset.
- Conventional commit titles (`feat(compiler): …`, `docs: …`) are appreciated.
- CI must pass (from v0.1: lint, typecheck, test, size-limit).

## Labels
`type: *` (bug, feature, docs, design, adr, chore), `area: *` (compiler, types, plugin, proxy, server, client, navigation, metadata, cli, translate, codemod, testing, docs, infra), `priority: *`, `good first issue`, `help wanted`.

## License
By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
