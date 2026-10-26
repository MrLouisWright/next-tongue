# Loomlocale API contract (as assumed by next-tongue 1.0)

Base URL: `https://loomlocale.com/api/v1` (override: `cloud.baseURL`, `--base-url`, `LOOMLOCALE_API_URL`).
All bodies are JSON. Authenticated endpoints require `Authorization: Bearer <token>`.
Errors: non-2xx with `{ "error": "<code>", "message": "<human text>" }`. The CLI special-cases `401` (→ "run tongue login") and `402` (→ allowance exhausted).
Client: [`packages/next-tongue/src/cloud/api.ts`](../packages/next-tongue/src/cloud/api.ts). Mock: [`scripts/mock-loomlocale.mjs`](../packages/next-tongue/scripts/mock-loomlocale.mjs).

## Auth — OAuth 2.0 Device Authorization Grant (RFC 8628)

### `POST /device/code` (no auth)
```json
// request
{ "client_id": "next-tongue-cli", "scope": "projects translate sync" }
// 200
{ "device_code": "…", "user_code": "ABCD-EFGH", "verification_uri": "https://loomlocale.com/device",
  "verification_uri_complete": "https://loomlocale.com/device?code=ABCD-EFGH", "expires_in": 900, "interval": 5 }
```

### `POST /device/token` (no auth)
```json
// request
{ "client_id": "next-tongue-cli", "device_code": "…", "grant_type": "urn:ietf:params:oauth:grant-type:device_code" }
// 200
{ "access_token": "llt_…", "token_type": "Bearer", "expires_in": 7776000, "scope": "projects translate sync" }
// 400 (RFC 8628 §3.5)
{ "error": "authorization_pending" | "slow_down" | "expired_token" | "access_denied" }
```
CLI polls every `interval` s, +5 s on `slow_down`. No refresh token is assumed (long-lived token; re-login on 401).

## `GET /me`
```json
{ "user": { "id": "u_1", "email": "dev@example.com", "name": "Dev" },
  "org":  { "id": "o_1", "name": "Example Ltd" },
  "plan": { "name": "Starter", "kind": "payg" | "subscription", "charsIncluded": 500000, "charsUsed": 12000,
            "periodEnd": "2026-11-30T00:00:00Z", "paygPerMillionGBP": 25 } }
```

## Projects
`GET /projects` → `{ "projects": Project[] }`
`POST /projects` `{ "name", "sourceLocale", "targetLocales": string[] }` → `201 { "project": Project }`
```ts
type Project = { id: string; name: string; sourceLocale: string; targetLocales: string[]; createdAt?: string };
```

## `POST /projects/:id/estimate`
```json
// request
{ "sourceLocale": "en", "targetLocales": ["de","fr"], "items": [{ "key": "home.title", "text": "Hello, {name}!" }] }
// 200
{ "chars": 28, "billableChars": 28, "costGBP": 0.0007, "currency": "GBP", "allowanceRemaining": null, "withinAllowance": false }
```
`chars` = Σ source chars (Unicode code points) × target count. `allowanceRemaining` is `null` for PAYG.

## `POST /projects/:id/translate` → job
```json
// request
{ "sourceLocale": "en", "targetLocales": ["de"],
  "items": [{ "key": "home.title", "text": "Hello, __TONGUE_0__!", "description": "Hero heading", "maxLength": 40 }],
  "glossary": { "Loomlocale": { "doNotTranslate": true }, "invoice": { "de": "Rechnung" } },
  "context": "B2B invoicing app",
  "placeholderPattern": "__TONGUE_n__",
  "idempotencyKey": "uuid" }
// 202 (or 200 with a finished job)
{ "job": Job }
```
Server must return `__TONGUE_n__` tokens verbatim. The CLI re-validates everything (tokens, ICU args, plural categories, glossary, maxLength) and retries failed keys once in a new job.

## `GET /jobs/:id`
```ts
type Job = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  progress: { done: number; total: number };
  results?: Array<{ key: string; locale: string; text: string }>;   // present when finished
  errors?: Array<{ key: string; locale: string; message: string }>;
  billedChars?: number;
};
```
CLI polls every 1 s (30 min timeout).

## `POST /projects/:id/sync`
```json
// request
{ "mode": "push" | "pull" | "both", "sourceLocale": "en", "cursor": "c42",
  "entries": [{ "key": "home.title", "locale": "de", "text": "Hallo, {name}!", "sourceHash": "sha256:…", "origin": "cli" | "machine" }],
  "deletedKeys": ["old.key"] }
// 200
{ "cursor": "c43",
  "entries": [{ "key": "home.title", "locale": "fr", "text": "Bonjour, {name} !", "sourceHash": "sha256:…", "updatedAt": "…", "origin": "web" }],
  "deletedKeys": [], "glossary": { … }, "accepted": 12 }
```
- `push` entries include source-locale strings (`locale = sourceLocale`) and targets **with real ICU text** (unmasked).
- `pull` returns target entries changed on the server since `cursor` (web edits). `sourceHash` = `sha256:<hex>` of the source text the translation belongs to; the CLI ignores entries whose hash no longer matches the local source.
- `cursor` is opaque, stored in `tongue.lock` under `$cloud.cursor`.

## Contract additions/changes requested from the server (Loom-Locale/loomlocale)
1. **Device flow**: RFC 8628 error shape on `/device/token` with HTTP 400 (not 200), `client_id` = `next-tongue-cli`.
2. **`/me.plan`** fields `kind`, `charsIncluded`, `charsUsed`, `paygPerMillionGBP` (wizard shows allowance/cost).
3. **`/estimate`** accepts `items` (keys + text) rather than just a char count, so server can apply glossary/dedupe rules and return `billableChars`.
4. **`/translate`**: `placeholderPattern`, `idempotencyKey`, per-item `description`/`maxLength`, inline `glossary` (merged with project glossary server-side), `context`.
5. **`/sync`**: single endpoint with `mode`, opaque `cursor`, `sourceHash` per entry, `origin` (`cli`/`machine`/`web`), `deletedKeys` both ways, glossary in every response.
6. Job results returned inline on `GET /jobs/:id` (no separate results endpoint); large jobs could later add pagination via `results_cursor`.
7. Errors: `402 { error: "allowance_exhausted" }` when plan/credit is exhausted; `429` with `Retry-After` (CLI currently surfaces it as an error — retry/backoff is a follow-up).
