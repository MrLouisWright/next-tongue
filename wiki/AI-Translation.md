> 📄 Mirrors [`docs/ai-translation.md`](https://github.com/MrLouisWright/next-tongue/blob/main/docs/ai-translation.md) in the main repo — the repo version is canonical.

# AI translation

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](Roadmap).

`tongue translate` is a built-in, **optional** workflow: you bring your own key to any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure OpenAI, OpenRouter, Together, Groq, xAI, Mistral, local Ollama/LM Studio/vLLM, …). There is no next-tongue service, no account, no telemetry.

## Configure

```ts
translate: {
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  apiKeyEnv: 'TONGUE_API_KEY',
  glossary: './tongue.glossary.json',
  lockfile: './tongue.lock',
  context: 'Consumer banking app. Friendly, concise. Informal "du" in German.',
}
```
Local example: `baseURL: 'http://localhost:11434/v1', model: 'qwen2.5:14b'` (key may be any string).

## Glossary

```json
{
  "terms": {
    "Workspace": { "de": "Workspace", "fr": "Espace de travail", "note": "Product term" },
    "next-tongue": { "doNotTranslate": true }
  }
}
```
Terms are injected into the prompt; after translation, `tongue translate` verifies glossary terms appear and flags violations.

## Lockfile (`tongue.lock`)

Commit it. Per locale and key it records a hash of the **source** text, a hash of the **target** text, model and timestamp:
```json
{ "version": 1, "de": { "home.title": { "source": "sha256:…", "target": "sha256:…", "model": "gpt-4.1-mini", "at": "2026-10-14T10:00:00Z" } } }
```
- Source changed → key is **stale**: `tongue check` flags it as outdated (`stale`, severity `strict.stale`), `tongue translate` retranslates it and `tongue export --missing-only` includes it ([#42](https://github.com/MrLouisWright/next-tongue/issues/42)). Hashes are SHA-256 via `node:crypto`.
- Target changed by a human (hash differs) → treated as **human-edited** and never overwritten unless `--retranslate`.

## Translator context
`$meta` (description, screenshot link, `maxLength`) is included in prompts; outputs longer than `maxLength` are retried once, then reported. See [Translator workflow](Translator-Workflow#translator-context).

## Placeholder protection and budgets
Before sending, `{args}` and tags are masked with opaque tokens and restored afterwards; a restored output that changes them is rejected. `translate.maxTokens` / `--max-cost` cap spend per run, and in CI (`CI=true`) `--review` is the default. Requests use global `fetch` only ([ADR 0012](https://github.com/MrLouisWright/next-tongue/blob/main/docs/adr/0012-zero-dependencies.md)).

## Safety guarantees (acceptance criteria for v0.5)

- Every LLM output is parsed as ICU and compared with the source: args, tags and plural categories (per target-locale CLDR rules) must match, otherwise it is retried once, then reported and skipped.
- Only messages and descriptions are sent; never source code, env, or file paths beyond key names.
- `--dry-run` shows the plan and estimated tokens without calling the API.
- The API key is read from the env var only and never written to disk or logs.

## Workflow suggestion

`tongue translate --review` in a PR → humans review `*.review.json` → `tongue translate --accept` merges them.
