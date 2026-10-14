# AI translation

> **Status: planned / pre-release.** This page documents the intended API of next-tongue. Nothing is published yet; names may change before v1.0. See [ROADMAP](../ROADMAP.md).

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
- Source changed → key is **stale**, retranslated on next run, reported by `tongue check`.
- Target changed by a human (hash differs) → treated as **human-edited** and never overwritten unless `--retranslate`.

## Safety guarantees (acceptance criteria for v0.4)

- Every LLM output is parsed as ICU and compared with the source: args, tags and plural categories (per target-locale CLDR rules) must match, otherwise it is retried once, then reported and skipped.
- Only messages and descriptions are sent; never source code, env, or file paths beyond key names.
- `--dry-run` shows the plan and estimated tokens without calling the API.
- The API key is read from the env var only and never written to disk or logs.

## Workflow suggestion

`tongue translate --review` in a PR → humans review `*.review.json` → `tongue translate --accept` merges them.

---
[Docs index](README.md) · [API reference](api-reference.md) · [Roadmap](../ROADMAP.md)
