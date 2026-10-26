# Loomlocale API contract (as assumed by next-tongue 1.0)

Base URL: `https://www.loomlocale.com/api/v1` (override: `cloud.baseURL`, `--base-url`, `LOOMLOCALE_API_URL`).
All bodies are JSON. Authenticated endpoints require `Authorization: Bearer <token>`.
Errors: non-2xx with the **flat envelope** `{ "error": "<code>", "message": "<human text>", "details"?: {…}, "request_id": "…" }`, where `error` is a string code. Defensively, the client also accepts a nested `{ "error": { "code", "message", "details", "request_id" } }`. Error messages include `(request id …)` when present. The CLI special-cases `401` (→ "run tongue login"), `402` (`insufficient_credit` → top-up link and **exit code 4**; `card_required` → card setup link and exit code 4; `spend_cap_reached` → `TONGUE_E_BUDGET`, exit 1; see below), `409` and `413` (see `/translate`).
**Forward compatibility:** the client ignores response fields it does not know (e.g. `org` on the token response, `spendCapGBP`/`token` on `/me`), so the server may add fields freely.
Server reference: Loom-Locale/loomlocale commits `f9a71b9`, `83d98cb` (requests 8–11).

### Retries, rate limits and idempotency
- On `429` or `503` the client waits for `Retry-After` (delta-seconds or HTTP-date, plus up to 250 ms jitter); without the header it uses exponential backoff with jitter (500 ms × 2ⁿ, capped at 30 s). Dropped connections are retried the same way. Default 5 retries (`cloud.maxRetries`). A `429` pauses **all** concurrent workers until the wait expires.
- `POST /translate` sends an `Idempotency-Key` header (also `idempotencyKey` in the body). The key is **deterministic** — a hash of project, locales, masked items, context, glossary and attempt — so a retry, or a re-run after a crash, returns the existing job instead of starting (and billing) a new one. The server keeps keys per org for 30 days. Reusing a key with a **different** request returns `409 conflict` (`details.error: "idempotency_key_reused"`); the CLI then retries **once** with a fresh key (the old key plus a random suffix). A second `409` is reported as an error.
- Resume: job ids and finished results are written to `<lockfile>.run.json` (git-ignore it). A re-run polls the recorded job (`GET /jobs/:id`); a `404` there means the job expired and the batch is resubmitted.
Client: [`packages/next-tongue/src/cloud/api.ts`](../packages/next-tongue/src/cloud/api.ts). Mock: [`scripts/mock-loomlocale.mjs`](../packages/next-tongue/scripts/mock-loomlocale.mjs).

## Auth — OAuth 2.0 Device Authorization Grant (RFC 8628)

### `POST /device/code` (no auth)
```json
// request
{ "client_id": "next-tongue-cli", "scope": "projects translate sync" }   // contract scope names; this is the default
// 200
{ "device_code": "…", "user_code": "ABCD-EFGH", "verification_uri": "https://www.loomlocale.com/device",
  "verification_uri_complete": "https://www.loomlocale.com/device?code=ABCD-EFGH", "expires_in": 900, "interval": 5 }
```

### `POST /device/token` (no auth)
```json
// request
{ "client_id": "next-tongue-cli", "device_code": "…", "grant_type": "urn:ietf:params:oauth:grant-type:device_code" }
// 200
{ "access_token": "llt_…", "token_type": "Bearer", "expires_in": 7776000, "scope": "projects translate sync", "org": { … } }
// 400 (RFC 8628 §3.5)
{ "error": "authorization_pending" | "slow_down" | "expired_token" | "access_denied" }
```
CLI polls every `interval` s, +5 s on `slow_down`. No refresh token is assumed (long-lived token; re-login on 401).
- Tokens start with `llt_` (the CLI warns if not). `scope` **echoes the requested scopes**. Extra fields such as `org` are ignored.
- An **unknown or already-redeemed** `device_code` returns `expired_token`, the same as a timed-out code. The CLI treats this as "restart login" ("This login code is no longer valid (expired, or already used). Restart with `tongue login`.").

## `GET /me`
```json
{ "user": { "id": "u_1", "email": "dev@example.com", "name": "Dev" },
  "org":  { "id": "o_1", "name": "Example Ltd" },
  "plan": { "name": "Credits", "kind": "free" | "credits" | "subscription", "charsIncluded": 500000, "charsUsed": 12000,   // older servers: "payg"
            "periodEnd": "2026-11-30T00:00:00Z", "paygPerMillionGBP": 25 },
  "spendCapGBP": 50, "token": { … },          // optional extras; the CLI ignores them
  "limits": { "translate": { "maxItems": 1000, "maxSourceChars": 200000, "maxTargetLocales": 50 },
              "maxActiveJobsPerOrg": 8, "rateLimitPerMinute": 600, "idempotencyKeyTtlHours": 720 },   // optional
  "creditBalanceGBP": 42.1,                    // optional (prepaid credits)
  "credit": { "creditBalanceGBP": 42.1, "lowCredit": false, "creditLots": [ … ], "topUpUrl": "https://…" },   // optional
  "nextExpiry": { "expiresAt": "2026-11-20T00:00:00Z", "amountGBP": 12.5, "expiringSoon": true } }   // optional, see "Credit expiry"
```
(`plan.periodSpendGBP` is optional: £ billed so far this period.)
- Monthly budgets: `monthlyChars` uses `plan.charsUsed`. `monthlyCostGBP` uses `plan.periodSpendGBP` when present; otherwise PAYG spend is estimated locally as `charsUsed × paygPerMillionGBP / 1e6`.
- `limits.translate` sets the batch caps (see `/translate`). If `limits` is absent or `/me` fails, the CLI uses the published defaults 1000 items / 200 000 source chars / 50 target locales.
- `creditBalanceGBP` (if present) is shown by `tongue whoami`. If `credit.lowCredit` is true, `whoami`, `update` and the wizard print `Loomlocale credit is low (£x). Top up at <credit.topUpUrl>.`
- `plan.kind`: `credits` (and `free` without an allowance) show the per-1M-chars rate. For monthly £ caps without `periodSpendGBP`, spend is derived from usage beyond the allowance at `paygPerMillionGBP`; `subscription` counts as £0.

### Credit expiry
Prepaid credits expire 12 months after purchase. `/me` and `/estimate` may carry:
- **Free allowance (all optional):** `cardOnFile: boolean`, `freeAllowanceClaimed: boolean`, `cardSetupUrl: string` (only while unclaimed), `allowanceType: "once" | "monthly"`, `allowanceRemaining: number` (characters). When `freeAllowanceClaimed === false`, `whoami` and `status` print `Add a card to claim your free one-time 50,000-character allowance: <cardSetupUrl>` (falling back to the billing page), and they print `Allowance remaining: N chars (one-time|monthly allowance)` when `allowanceRemaining` is a number. Missing or malformed fields are ignored.
- **Server shape (Loom-Locale/loomlocale credits):** `nextExpiry: { expiresAt, amountGBP, expiringSoon }` (null when there are no lots). The CLI reads `expiresAt` and `amountGBP`.
- Also accepted, defensively: `nextExpiry` as an ISO string with the amount in `nextExpiryGBP`, `expiringGBP` or `creditExpiringGBP`.
- Also accepted: the date as `date` or `at` inside the object.
- If no amount is sent, the warning omits it. An amount of 0 suppresses the warning.

If the expiry is within 30 days, `whoami`, `update` (before translating) and the wizard print a one-line warning to stderr, e.g. `⚠ £12.50 of Loomlocale credit expires on 2026-11-20 (in 25 days) — credits expire 12 months after purchase.` It is not printed with `--json`.

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
{ "chars": 28, "billableChars": 28, "costGBP": 0.0007, "currency": "GBP", "allowanceRemaining": null, "withinAllowance": false,
  "creditRequiredGBP": 0.0007, "creditBalanceGBP": 42.1, "withinCredit": true, "topUpUrl": "https://…",   // prepaid; topUpUrl only when withinCredit is false
  "allowed": true, "withinSpendCap": true, "note": "…" }     // all optional; withinSpendCap is a deprecated alias of withinCredit
```
- `chars` = Σ source chars (Unicode code points) of **unique texts** × target count. **Identical texts are counted once**, so the server estimate can be lower than the CLI's local count (which counts every key).
- `allowanceRemaining` is `null` for PAYG.
- Budget check: before translating (when any cap is set), the CLI requests one estimate per target locale and sums them, then enforces `cloud.budget` / `--max-chars` / `--max-cost` / env caps (`TONGUE_E_BUDGET`, exit 1).
- **Credit check:** `withinCredit` is authoritative. Per-locale `creditRequiredGBP` amounts are summed and compared with `creditBalanceGBP`. If any estimate says `withinCredit: false`, or the summed amount exceeds the balance, the run aborts before translating with the insufficient-credit error (exit code 4). `withinSpendCap` / `allowed` are deprecated and only read when `withinCredit` is absent (older servers). In that case a `false` aborts with exit 1 and shows `note`. Nothing is translated or billed.
- `creditBalanceGBP` (if present) is printed next to the run's estimated cost.
- `--dry-run` uses the local count and the PAYG rate only (no network).

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
Header: `Idempotency-Key: <same as body idempotencyKey>` (see above). Requests are **batched**, one target locale per request, within the server's `limits.translate` from `/me` (default 1000 items / 200 000 source chars). `cloud.batchSize` / `cloud.batchChars` can only lower these caps.
- `413 payload_too_large`: the CLI splits the batch in half and retries each half (recursively). A single key that is still too large is reported as failed for that locale.
- `402 card_required`: `{ "error": "card_required", "message": "…", "details": { "setupUrl": "https://…" }, "request_id": "…" }`. A free workspace must add a card to claim its one-time 50,000-character allowance. The CLI prints `<message>. Nothing more was translated. Add a card at <setupUrl> and re-run (finished batches are kept). (request id …)` and exits with **code 4**, with no retry. `details.cardSetupUrl` is also accepted, and the fallback is `https://www.loomlocale.com/dashboard/billing`. Finished batches stay in the run state, so the re-run resumes.
- `402 insufficient_credit`: `{ "error": "insufficient_credit", "message": "…", "details": { "requiredGBP": 1.5, "balanceGBP": 0.2, "creditBalanceGBP": 0.2, "topUpUrl": "https://…" }, "request_id": "…" }`. The CLI prints `Insufficient Loomlocale credit: this run needs £1.50, balance is £0.20. Nothing more was translated. Top up at <topUpUrl> and re-run. (request id …)` and exits with **code 4**, with no retry. `details.balanceGBP` is preferred over `details.creditBalanceGBP`. If `topUpUrl` is missing, it falls back to `https://www.loomlocale.com/dashboard/billing`. Finished batches stay in the run state, so the re-run resumes.
- `402 spend_cap_reached` now only means the job's own `maxCostGBP` was exceeded. The CLI reports it as `TONGUE_E_BUDGET` (spending cap exceeded, exit 1). The org-wide monthly spend cap was replaced by prepaid credit.

Locales run concurrently (`--concurrency` / `cloud.concurrency`, default 4).
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
  "entries": [{ "key": "home.title", "locale": "de", "text": "Hallo, {name}!", "sourceHash": "sha256:…", "origin": "cli" | "machine", "file": "messages/en.json" }],
  "deletedKeys": ["old.key"] }
// 200
{ "cursor": "c43",
  "entries": [{ "key": "home.title", "locale": "fr", "text": "Bonjour, {name} !", "sourceHash": "sha256:…", "updatedAt": "…", "origin": "web" }],
  "deletedKeys": [], "glossary": { … }, "accepted": 12 }
```
- `push` entries include source-locale strings (`locale = sourceLocale`) and targets **with real ICU text** (unmasked).
- `pull` returns target entries changed on the server since `cursor` (web edits). `sourceHash` = `sha256:<hex>` of the source text the translation belongs to; the CLI ignores entries whose hash no longer matches the local source.
- `cursor` is opaque, stored in `tongue.lock` under `$cloud.cursor`.
- `file` (optional, both directions): the source dictionary a key belongs to. The CLI sends it on source entries. Keys created by sync without a `file` get `file_path = <sourceLocale>.json` on the server. Pulled entries may carry `file`; the CLI routes writes by key and source layout, and ignores pulled keys that do not exist in the local source.

## Contract additions/changes requested from the server (Loom-Locale/loomlocale)
1. **Device flow**: RFC 8628 error shape on `/device/token` with HTTP 400 (not 200), `client_id` = `next-tongue-cli`.
2. **`/me.plan`** fields `kind`, `charsIncluded`, `charsUsed`, `paygPerMillionGBP` (wizard shows allowance/cost).
3. **`/estimate`** accepts `items` (keys + text) rather than just a char count, so server can apply glossary/dedupe rules and return `billableChars`.
4. **`/translate`**: `placeholderPattern`, `idempotencyKey`, per-item `description`/`maxLength`, inline `glossary` (merged with project glossary server-side), `context`.
5. **`/sync`**: single endpoint with `mode`, opaque `cursor`, `sourceHash` per entry, `origin` (`cli`/`machine`/`web`), `deletedKeys` both ways, glossary in every response.
6. Job results returned inline on `GET /jobs/:id` (no separate results endpoint); large jobs could later add pagination via `results_cursor`.
7. Errors: `402 { error: "allowance_exhausted" }` when plan/credit is exhausted; `429`/`503` with `Retry-After` (now honoured by the CLI with backoff).

### Implemented by the server (83d98cb)
8. **Idempotency:** `Idempotency-Key` on `/translate` (same key → same job, 30 days; reuse with a different request → `409`); finished jobs readable for ≥ 30 days.
9. **Rate limits:** `Retry-After` on every `429`/`503`; `RateLimit-*` headers; per-org active-job cap (8, returned as `429` + `Retry-After: 10`).
10. **Budget:** `allowed` / `withinSpendCap` / `note` on `/estimate` (now superseded by `withinCredit`); `plan.periodSpendGBP` on `/me`.
11. **Batch limits:** published on `/me` as `limits`; `413 payload_too_large` above them.

### Prepaid credits (server credits release)
- `plan.kind` is `free | credits | subscription`, plus `credit` (`creditLots`, `lowCredit` → the CLI shows a low-credit hint in `whoami`, `update` and the wizard), `creditBalanceGBP` and `nextExpiry` on `/me`. The estimate carries `withinCredit` / `creditRequiredGBP` / `creditBalanceGBP`. `402 insufficient_credit` gives exit code 4, and `402 spend_cap_reached` gives `TONGUE_E_BUDGET`.
