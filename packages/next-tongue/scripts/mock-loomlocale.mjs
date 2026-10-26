#!/usr/bin/env node
/**
 * Mock Loomlocale API (docs/api-contract.md) for tests and the tarball smoke test.
 * `node scripts/mock-loomlocale.mjs [port]` prints `MOCK_URL=<base>` when ready.
 * "Translations" prefix the masked source with `[<locale>] ` so tokens survive.
 * Mirrors server f9a71b9 (Loom-Locale/loomlocale): llt_ tokens, scope echo, expired_token for
 * unknown/redeemed device codes, extra response fields clients must ignore, estimate counts
 * identical texts once, Idempotency-Key on translate, 429 + Retry-After.
 * Test knobs: rateLimit {translate, job, retryAfter}, dropJobPolls, pollsToFinish, spendCapGBP.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

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
    plan: opts.plan ?? { name: 'Pay as you go', kind: 'payg', charsIncluded: 0, charsUsed: 0, paygPerMillionGBP: 25 },
    breakKeys: new Set(opts.breakKeys ?? []),
    spendCapGBP: opts.spendCapGBP ?? null,
    rateLimit: { translate: 0, job: 0, retryAfter: '0', ...(opts.rateLimit ?? {}) },
    dropJobPolls: opts.dropJobPolls ?? 0,
    pollsToFinish: opts.pollsToFinish ?? 2,
    idempotency: new Map(), // key → job id
    active: new Set(),
    maxActive: 0,
    rateLimited: 0,
  };
  const tooMany = (res) => {
    state.rateLimited++;
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': state.rateLimit.retryAfter });
    res.end(JSON.stringify({ error: 'rate_limited', message: 'Too many requests' }));
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
      return json(res, 200, { user: { id: 'u_1', email: 'dev@example.com', name: 'Dev' }, org: { id: 'o_1', name: 'Example Ltd' }, plan: state.plan, spendCapGBP: state.spendCapGBP, token: { prefix: 'llt_', scope: 'projects translate sync' } });
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
        // Identical texts are counted once.
        const unique = new Set(body.items.map((i) => i.text));
        const chars = [...unique].reduce((n, t) => n + [...t].length, 0) * body.targetLocales.length;
        const left = state.plan.kind === 'payg' ? null : state.plan.charsIncluded - state.plan.charsUsed;
        const within = left != null && chars <= left;
        const costGBP = within ? 0 : Math.round((chars / 1e6) * state.plan.paygPerMillionGBP * 100) / 100;
        const withinSpendCap = state.spendCapGBP == null || costGBP <= state.spendCapGBP;
        return json(res, 200, { chars, billableChars: within ? 0 : chars, costGBP, currency: 'GBP', allowanceRemaining: left, withinAllowance: within, allowed: withinSpendCap, withinSpendCap, ...(withinSpendCap ? {} : { note: `Org spend cap £${state.spendCapGBP} reached` }) });
      }
      if (m[2] === 'translate') {
        if (state.rateLimit.translate > 0) {
          state.rateLimit.translate--;
          return tooMany(res);
        }
        const idem = req.headers['idempotency-key'] ?? body.idempotencyKey;
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
        state.jobs.set(id, { polls: 0, job: { id, status: 'succeeded', progress: { done: total, total }, results, errors: [], billedChars: body.items.reduce((n, i) => n + [...i.text].length, 0) * body.targetLocales.length } });
        return json(res, 202, { job: { id, status: 'queued', progress: { done: 0, total } } });
      }
      // sync
      const pulled = [];
      if (body.mode === 'push' || body.mode === 'both') {
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
      if (j.polls >= state.pollsToFinish) state.active.delete(j.job.id);
      if (j.polls < state.pollsToFinish) return json(res, 200, { job: { id: j.job.id, status: 'running', progress: { done: Math.floor(j.job.progress.total / 2), total: j.job.progress.total } } });
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
    close: () => new Promise((r) => server.close(() => r())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = createMockLoomlocale({ projects: process.env.MOCK_PROJECT ? [{ id: 'prj_existing', name: 'existing', sourceLocale: 'en', targetLocales: ['de'] }] : [] });
  const url = await mock.listen(Number(process.argv[2] ?? 0));
  console.log(`MOCK_URL=${url}`);
}
