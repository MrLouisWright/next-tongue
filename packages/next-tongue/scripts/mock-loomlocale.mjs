#!/usr/bin/env node
/**
 * Production base: https://www.loomlocale.com/api/v1 (this mock serves the same /api/v1 paths).
 * Mock Loomlocale API (docs/api-contract.md) for tests and the tarball smoke test.
 * `node scripts/mock-loomlocale.mjs [port]` prints `MOCK_URL=<base>` when ready.
 * "Translations" prefix the masked source with `[<locale>] ` so tokens survive.
 * Mirrors server f9a71b9 (Loom-Locale/loomlocale): llt_ tokens, scope echo, expired_token for
 * unknown/redeemed device codes, extra response fields clients must ignore, estimate counts
 * identical texts once, Idempotency-Key on translate, 429 + Retry-After.
 * Mirrors 83d98cb too: 409 conflict when an Idempotency-Key is reused with a different request,
 * 413 payload_too_large over the batch limits, /me `limits` and plan.periodSpendGBP.
 * Prepaid credits (plan.kind free|credits|subscription; estimate withinCredit/creditRequiredGBP): creditBalanceGBP on /me + estimate, 402 insufficient_credit.
 * Test knobs: rateLimit {translate, job, retryAfter}, dropJobPolls, pollsToFinish, spendCapGBP,
 * limits (published on /me; null = omitted), enforceLimits (what translate enforces),
 * cardRequired {setupUrl, afterTranslates}, account (extra /me fields), nestedErrors, spendCapReached, lowCredit, conflicts (force N 409s), creditBalanceGBP, insufficientCredit {topUpUrl|null}, creditExpiry (fields spread into /me + estimate), stuckJobs, failJobs {error, message}, queuedPolls, progressPerPoll, translationMemory, faults [{ match: 'POST /sync', mode: slow|hang|reset|status, times, delayMs, status, syncMode }] (estimate grossChars/memoryChars/perLocale; records state.estimates, state.translateBodies).
 * Estimate: allowanceRemaining is the allowance before the run; billableChars = chars beyond it.
 */
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
const sha = (t) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;
const canon = (g) => JSON.stringify(Object.fromEntries(Object.keys(g ?? {}).sort().map((k) => [k, Object.fromEntries(Object.keys(g[k]).sort().map((f) => [f, g[k][f]]))])));

export function createMockLoomlocale(opts = {}) {
  const state = {
    token: opts.token ?? 'llt_test',
    approveAfter: opts.approveAfter ?? 1,
    devices: new Map(),
    projects: [...(opts.projects ?? [])],
    jobs: new Map(),
    entries: new Map(), // `${locale}\0${key}` → entry
    webEdits: [],
    glossary: opts.glossary ?? {},
    cursor: 0,
    requests: [],
    plan: opts.plan ?? { name: 'Credits', kind: 'credits', charsIncluded: 0, charsUsed: 0, paygPerMillionGBP: 25 },
    breakKeys: new Set(opts.breakKeys ?? []),
    spendCapGBP: opts.spendCapGBP ?? null,
    rateLimit: { translate: 0, job: 0, retryAfter: '0', ...(opts.rateLimit ?? {}) },
    dropJobPolls: opts.dropJobPolls ?? 0,
    pollsToFinish: opts.pollsToFinish ?? 2,
    idempotency: new Map(), // key → job id
    active: new Set(),
    maxActive: 0,
    rateLimited: 0,
    limits: opts.limits === null ? null : { translate: { maxItems: 1000, maxSourceChars: 200000, maxTargetLocales: 50 }, maxActiveJobsPerOrg: 8, rateLimitPerMinute: 600, idempotencyKeyTtlHours: 720, ...(opts.limits ?? {}) },
    enforceLimits: opts.enforceLimits ?? null,
    conflicts: opts.conflicts ?? 0,
    creditBalanceGBP: opts.creditBalanceGBP,
    insufficientCredit: opts.insufficientCredit ?? null,
    translateSizes: [],
    cardRequired: opts.cardRequired ?? null, // { setupUrl?, afterTranslates? }
    account: opts.account ?? {}, // spread into /me: cardOnFile, freeAllowanceClaimed, cardSetupUrl, allowanceType, allowanceRemaining
    nestedErrors: opts.nestedErrors ?? false,
    spendCapReached: opts.spendCapReached ?? false,
    lowCredit: opts.lowCredit,
    creditExpiry: opts.creditExpiry ?? {},
    queuedPolls: opts.queuedPolls ?? 0, // first N polls report queued (done 0, real total), like 6a2917e
    progressPerPoll: opts.progressPerPoll ?? null, // running: first batch 10 strings, then +N per poll
    translationMemory: opts.translationMemory ?? false, // a5fb584: estimate excludes cached texts (synced targets by sourceHash; translated texts with the same glossary)
    memory: new Map(), // `${locale}\0${sourceHash}` → canonical glossary JSON | '*'
    estimates: [],
    translateBodies: [],
    faults: (opts.faults ?? []).map((f) => ({ ...f })), // slow | hang | reset | status (502/504) per request signature
    faultHits: [],
    syncPushSizes: [],
    stuckJobs: opts.stuckJobs ?? false, // jobs stay queued forever (progress 0)
    failJobs: opts.failJobs ?? null, // { error, message }: jobs finish as failed with this reason // e.g. { nextExpiry: '2026-11-20', nextExpiryGBP: 12.5 }
  };
  const memHit = (l, t, g) => {
    if (!state.translationMemory) return false;
    const m = state.memory.get(`${l}\0${sha(t)}`);
    return m === '*' || m === canon(g);
  };
  const tooMany = (res) => {
    state.rateLimited++;
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': state.rateLimit.retryAfter });
    res.end(JSON.stringify({ error: 'rate_limited', message: 'Too many requests' }));
  };
  let reqSeq = 0;
  // Errors use the flat envelope { error: "<code>", message, details?, request_id }; nestedErrors → { error: { code, … } }.
  const fail = (res, status, code, message, details) => {
    const request_id = `req_${++reqSeq}`;
    const flat = { error: code, message, ...(details ? { details } : {}), request_id };
    json(res, status, state.nestedErrors ? { error: { code, message, ...(details ? { details } : {}), request_id } } : flat);
  };
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    state.requests.push({ method: req.method, path, body, auth: req.headers.authorization ?? null, idempotencyKey: req.headers['idempotency-key'] ?? null });
    const authed = req.headers.authorization === `Bearer ${state.token}`;
    // 1.0.5 fault injection: { match: 'POST /sync' (prefix of "METHOD path", path without /projects/:id), mode, times, delayMs, status, syncMode }
    const sig = `${req.method} ${path.replace(/^\/projects\/[^/]+/, '')}`;
    const fault = state.faults.find((f) => (f.times ?? 1) > 0 && sig.startsWith(f.match) && (!f.syncMode || body.mode === f.syncMode));
    if (fault) {
      fault.times = (fault.times ?? 1) - 1;
      state.faultHits.push({ sig, mode: fault.mode, syncMode: body.mode });
      if (fault.mode === 'reset') return void req.socket.destroy();
      if (fault.mode === 'hang') return; // never answers (client timeout)
      if (fault.mode === 'status') return json(res, fault.status ?? 504, { error: fault.status === 502 ? 'bad_gateway' : 'gateway_timeout', message: 'FUNCTION_INVOCATION_TIMEOUT' });
      if (fault.mode === 'slow') await new Promise((r) => setTimeout(r, fault.delayMs ?? 1000));
    }
    if (req.method === 'POST' && /\/sync$/.test(path) && body.mode === 'push') state.syncPushSizes.push((body.entries ?? []).length);

    if (req.method === 'POST' && path === '/device/code') {
      const device_code = randomUUID();
      state.devices.set(device_code, 0);
      state.devices.scope = body.scope;
      const base = `http://${req.headers.host}`;
      return json(res, 200, { device_code, user_code: 'ABCD-EFGH', verification_uri: `${base}/device`, verification_uri_complete: `${base}/device?code=ABCD-EFGH`, expires_in: 600, interval: 1 });
    }
    if (req.method === 'POST' && path === '/device/token') {
      const n = state.devices.get(body.device_code);
      if (n == null) return json(res, 400, { error: 'expired_token' });
      if (n < state.approveAfter) {
        state.devices.set(body.device_code, n + 1);
        return json(res, 400, { error: 'authorization_pending' });
      }
      state.devices.delete(body.device_code);
      // Redeemed codes are forgotten → a second poll gets expired_token.
      return json(res, 200, { access_token: state.token, token_type: 'Bearer', expires_in: 7776000, scope: body.scope ?? state.devices.scope ?? 'projects translate sync', org: { id: 'o_1', name: 'Example Ltd' } });
    }
    if (!authed) return json(res, 401, { error: 'unauthorized', message: 'Missing or invalid token' });

    if (req.method === 'GET' && path === '/me') {
      return json(res, 200, { user: { id: 'u_1', email: 'dev@example.com', name: 'Dev' }, org: { id: 'o_1', name: 'Example Ltd' }, plan: state.plan, spendCapGBP: state.spendCapGBP, ...(state.limits ? { limits: state.limits } : {}), ...(state.creditBalanceGBP !== undefined
        ? { creditBalanceGBP: state.creditBalanceGBP, credit: { creditBalanceGBP: state.creditBalanceGBP, lowCredit: state.lowCredit ?? (state.creditBalanceGBP ?? 0) < 1, creditLots: [], topUpUrl: 'https://loomlocale.test/top-up' } }
        : {}), ...state.creditExpiry, ...state.account, token: { prefix: 'llt_', scope: 'projects translate sync' } });
    }
    if (path === '/projects' && req.method === 'GET') return json(res, 200, { projects: state.projects });
    if (path === '/projects' && req.method === 'POST') {
      const project = { id: `prj_${state.projects.length + 1}`, name: body.name, sourceLocale: body.sourceLocale, targetLocales: body.targetLocales, createdAt: new Date(0).toISOString() };
      state.projects.push(project);
      return json(res, 201, { project });
    }
    let m = /^\/projects\/([^/]+)\/(estimate|translate|sync)$/.exec(path);
    if (m && req.method === 'POST') {
      const project = state.projects.find((p) => p.id === decodeURIComponent(m[1]));
      if (!project) return json(res, 404, { error: 'not_found', message: 'Unknown project' });
      if (m[2] === 'estimate') {
        // Identical texts are counted once; like a5fb584, translation-memory hits (per locale, same glossary) are excluded.
        state.estimates.push({ sourceLocale: body.sourceLocale, targetLocales: body.targetLocales, items: body.items, glossary: body.glossary });
        const unique = [...new Set(body.items.map((i) => i.text))];
        const grossChars = unique.reduce((n, t) => n + [...t].length, 0) * body.targetLocales.length;
        const perLocale = {};
        let chars = 0;
        for (const l of body.targetLocales) {
          const miss = unique.filter((t) => t !== '' && !memHit(l, t, body.glossary));
          const c = miss.reduce((n, t) => n + [...t].length, 0);
          perLocale[l] = { chars: c, texts: miss.length, memoryHits: unique.length - miss.length };
          chars += c;
        }
        const left = state.plan.kind === 'payg' || state.plan.kind === 'credits' ? null : state.plan.charsIncluded - state.plan.charsUsed;
        const within = left != null && chars <= left;
        // Partial cover: the allowance pays for what it can, the rest is billable (allowanceRemaining is before this run).
        const billableChars = left == null ? chars : Math.max(0, chars - Math.max(0, left));
        const costGBP = within ? 0 : Math.round((billableChars / 1e6) * state.plan.paygPerMillionGBP * 100) / 100;
        const withinSpendCap = state.spendCapGBP == null || costGBP <= state.spendCapGBP;
        return json(res, 200, { chars, grossChars, memoryChars: grossChars - chars, perLocale, billableChars, costGBP, currency: 'GBP', allowanceRemaining: left, withinAllowance: within, ...(state.creditBalanceGBP != null
          ? (() => {
              // Prepaid: withinCredit is authoritative; withinSpendCap is its deprecated alias.
              const withinCredit = costGBP <= state.creditBalanceGBP;
              return { creditRequiredGBP: costGBP, creditBalanceGBP: state.creditBalanceGBP, withinCredit, allowed: withinCredit, withinSpendCap: withinCredit, ...(withinCredit ? {} : { topUpUrl: 'https://loomlocale.test/top-up' }) };
            })()
          : { allowed: withinSpendCap, withinSpendCap }), ...state.creditExpiry, ...(withinSpendCap ? {} : { note: `Org spend cap £${state.spendCapGBP} reached` }) });
      }
      if (m[2] === 'translate') {
        if (state.rateLimit.translate > 0) {
          state.rateLimit.translate--;
          return tooMany(res);
        }
        if (state.cardRequired && (state.cardRequired.afterTranslates ?? 0) <= 0) {
          return fail(res, 402, 'card_required', 'Add a card to claim your free 50,000-character allowance.', { setupUrl: state.cardRequired.setupUrl ?? 'https://loomlocale.test/billing/card' });
        }
        if (state.cardRequired) state.cardRequired.afterTranslates--;
        if (state.insufficientCredit) {
          const bal = state.creditBalanceGBP ?? 0;
          return fail(res, 402, 'insufficient_credit', `Not enough prepaid credit: this job needs £1.5000, balance is £${bal.toFixed(2)}.`, { requiredGBP: 1.5, balanceGBP: bal, creditBalanceGBP: bal, ...(state.insufficientCredit.topUpUrl !== null ? { topUpUrl: state.insufficientCredit.topUpUrl ?? 'https://loomlocale.test/billing/top-up' } : {}) });
        }
        if (state.spendCapReached) {
          return fail(res, 402, 'spend_cap_reached', `Estimated cost £3 exceeds max_cost_gbp`, { estimate: {} });
        }
        const L = state.enforceLimits ?? state.limits?.translate ?? { maxItems: 1000, maxSourceChars: 200000, maxTargetLocales: 50 };
        const sourceChars = body.items.reduce((n, i) => n + [...i.text].length, 0);
        if (body.items.length > L.maxItems || sourceChars > L.maxSourceChars || body.targetLocales.length > L.maxTargetLocales) {
          return json(res, 413, { error: 'payload_too_large', message: 'Batch too large; split it', details: { items: body.items.length, sourceChars, targetLocales: body.targetLocales.length, limits: L } });
        }
        const idem = req.headers['idempotency-key'] ?? body.idempotencyKey;
        const hash = JSON.stringify([body.sourceLocale, body.targetLocales, body.items]);
        if (state.conflicts > 0 || (idem && state.idempotency.has(idem) && state.jobs.get(state.idempotency.get(idem)).hash !== hash)) {
          if (state.conflicts > 0) state.conflicts--;
          return json(res, 409, { error: 'conflict', message: 'Idempotency-Key was already used with a different request', details: { error: 'idempotency_key_reused' } });
        }
        state.translateSizes.push(body.items.length);
        state.translateBodies.push(body);
        if (state.translationMemory) for (const l of body.targetLocales) for (const it of body.items) state.memory.set(`${l}\0${sha(it.text)}`, canon(body.glossary));
        if (idem && state.idempotency.has(idem)) {
          const prev = state.jobs.get(state.idempotency.get(idem));
          return json(res, 200, { job: { id: prev.job.id, status: 'queued', progress: { done: 0, total: prev.job.progress.total } } });
        }
        const id = `job_${state.jobs.size + 1}`;
        if (idem) state.idempotency.set(idem, id);
        state.active.add(id);
        state.maxActive = Math.max(state.maxActive, state.active.size);
        const results = [];
        for (const locale of body.targetLocales) {
          for (const item of body.items) {
            const text = state.breakKeys.has(item.key) ? `[${locale}] broken` : `[${locale}] ${item.text}`;
            results.push({ key: item.key, locale, text });
          }
        }
        const total = results.length;
        state.jobs.set(id, { hash, polls: 0, job: { id, status: 'succeeded', progress: { done: total, total }, results, errors: [], billedChars: body.items.reduce((n, i) => n + [...i.text].length, 0) * body.targetLocales.length } });
        return json(res, 202, { job: { id, status: 'queued', progress: { done: 0, total } } });
      }
      // sync
      const pulled = [];
      if (body.mode === 'push' || body.mode === 'both') {
        if (state.translationMemory) for (const e of body.entries ?? []) if (e.locale !== body.sourceLocale && e.sourceHash) state.memory.set(`${e.locale}\0${e.sourceHash}`, '*');
        for (const e of body.entries ?? []) state.entries.set(`${e.locale}\0${e.key}`, { ...e, file: e.file ?? `${body.sourceLocale}.json`, updatedAt: new Date().toISOString() });
        for (const k of body.deletedKeys ?? []) for (const id of [...state.entries.keys()]) if (id.endsWith(`\0${k}`)) state.entries.delete(id);
      }
      if (body.mode === 'pull' || body.mode === 'both') pulled.push(...state.webEdits.splice(0));
      state.cursor++;
      return json(res, 200, { cursor: `c${state.cursor}`, entries: pulled, deletedKeys: [], glossary: state.glossary, accepted: body.entries?.length ?? 0 });
    }
    m = /^\/jobs\/([^/]+)$/.exec(path);
    if (m && req.method === 'GET') {
      if (state.dropJobPolls > 0) {
        state.dropJobPolls--;
        req.socket.destroy(); // simulate a dropped connection
        return;
      }
      if (state.rateLimit.job > 0) {
        state.rateLimit.job--;
        return tooMany(res);
      }
      const j = state.jobs.get(m[1]);
      if (!j) return json(res, 404, { error: 'not_found' });
      j.polls++;
      if (state.stuckJobs) return json(res, 200, { job: { id: j.job.id, status: 'queued', progress: { done: 0, total: j.job.progress.total } } });
      if (state.failJobs) {
        state.active.delete(j.job.id);
        return json(res, 200, { job: { id: j.job.id, status: 'failed', progress: { done: 0, total: j.job.progress.total }, results: [], errors: [], error: state.failJobs.error ?? 'provider_error', message: state.failJobs.message ?? 'Upstream translation provider failed' } });
      }
      if (j.polls >= state.pollsToFinish) state.active.delete(j.job.id);
      const total = j.job.progress.total;
      if (j.polls <= state.queuedPolls) return json(res, 200, { job: { id: j.job.id, status: 'queued', progress: { done: 0, total } } });
      if (j.polls < state.pollsToFinish) {
        const n = j.polls - state.queuedPolls;
        const done = state.progressPerPoll != null ? Math.min(total, 10 + (n - 1) * state.progressPerPoll) : Math.floor(total / 2);
        return json(res, 200, { job: { id: j.job.id, status: 'running', progress: { done, total } } });
      }
      return json(res, 200, { job: j.job });
    }
    return json(res, 404, { error: 'not_found', message: `${req.method} ${path}` });
  });
  return {
    state,
    server,
    async listen(port = 0) {
      await new Promise((r) => server.listen(port, '127.0.0.1', r));
      const addr = server.address();
      return `http://127.0.0.1:${addr.port}/api/v1`;
    },
    close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = createMockLoomlocale({ projects: process.env.MOCK_PROJECT ? [{ id: 'prj_existing', name: 'existing', sourceLocale: 'en', targetLocales: ['de'] }] : [] });
  const url = await mock.listen(Number(process.argv[2] ?? 0));
  console.log(`MOCK_URL=${url}`);
}
