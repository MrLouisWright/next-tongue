# Migrating to next-tongue 1.0

The runtime (`getT`, `useT`, proxy, compiler, `tongue check/build/extract`) is unchanged. Only machine translation changed.

## What was removed
- Direct OpenAI-compatible client and `TONGUE_API_KEY`.
- `translate.baseURL`, `translate.model`, `translate.apiKeyEnv`, `translate.maxTokens` (config load now fails with a hint if present).
- `tongue translate --concurrency` and `--max-cost` (use `--max-chars` / `translate.maxChars`).

## Steps
1. Delete the removed `translate.*` keys from `tongue.config.*` (keep `glossary`, `lockfile`, `context`).
2. `npx tongue login` then `npx tongue link` (adds `cloud.projectId`).
3. `npx tongue update --dry-run` to see what would be sent; then `npx tongue update`.
4. In CI replace `TONGUE_API_KEY` with `LOOMLOCALE_TOKEN` and `tongue translate` with `tongue update --ci`.

Your existing `tongue.lock` is reused: keys already translated (matching source hash) are not re-sent. The lock is upgraded to version 2 on first write.

## Staying on BYO OpenAI
`npm i next-tongue@^0.9` keeps the 0.9 BYO-key `tongue translate`. 0.9.x receives security fixes only.
