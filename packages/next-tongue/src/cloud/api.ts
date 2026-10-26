/**
 * Typed client for the Loomlocale hosted API (next-tongue 1.0).
 * Contract: docs/api-contract.md. Zero runtime deps: uses global fetch.
 */
import { TongueError } from '../errors.js';

export const DEFAULT_BASE_URL = 'https://loomlocale.com/api/v1';
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export const CLIENT_ID = 'next-tongue-cli';
/** Scopes requested at login (contract names). The token response echoes them. */
export const DEFAULT_SCOPES = 'projects translate sync';
/** Loomlocale access tokens start with this prefix. */
export const TOKEN_PREFIX = 'llt_';

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

export type DeviceTokenSuccess = {
  access_token: string;
  token_type: 'Bearer';
  expires_in?: number;
  scope?: string;
};

export type DeviceTokenError = {
  error: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied';
  error_description?: string;
};

export type Plan = {
  name: string;
  kind: 'payg' | 'subscription';
  /** Monthly included characters (0 for PAYG). */
  charsIncluded: number;
  charsUsed: number;
  periodEnd?: string;
  /** PAYG price, GBP per 1,000,000 characters (default 25). */
  paygPerMillionGBP: number;
  /** £ billed so far this period (server-computed; preferred for monthly £ caps). Optional. */
  periodSpendGBP?: number;
};

/** Published per-request limits (`GET /me` → `limits`). */
export type Limits = {
  translate?: { maxItems?: number; maxSourceChars?: number; maxTargetLocales?: number };
  maxActiveJobsPerOrg?: number;
  rateLimitPerMinute?: number;
  idempotencyKeyTtlHours?: number;
};

/** Server defaults used when `/me` has no `limits`. */
export const DEFAULT_TRANSLATE_LIMITS = { maxItems: 1000, maxSourceChars: 200_000, maxTargetLocales: 50 } as const;

export function translateLimits(me: Pick<Me, 'limits'> | null | undefined): { maxItems: number; maxSourceChars: number; maxTargetLocales: number } {
  const t = me?.limits?.translate ?? {};
  const pos = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : d);
  return {
    maxItems: pos(t.maxItems, DEFAULT_TRANSLATE_LIMITS.maxItems),
    maxSourceChars: pos(t.maxSourceChars, DEFAULT_TRANSLATE_LIMITS.maxSourceChars),
    maxTargetLocales: pos(t.maxTargetLocales, DEFAULT_TRANSLATE_LIMITS.maxTargetLocales),
  };
}

export type Me = {
  user: { id: string; email: string; name?: string };
  org: { id: string; name: string };
  plan: Plan;
  /** Org monthly spend cap set on loomlocale.com (null = none). Optional. */
  spendCapGBP?: number | null;
  /** Published batch/rate limits. Optional. */
  limits?: Limits;
  /** Prepaid credit balance (upcoming). Optional. */
  creditBalanceGBP?: number | null;
} & CreditExpiryFields;

export type Project = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
  createdAt?: string;
};

export type EstimateRequest = {
  sourceLocale: string;
  targetLocales: string[];
  items: Array<{ key: string; text: string }>;
};

export type Estimate = {
  /** Source characters × target locales. */
  chars: number;
  billableChars: number;
  costGBP: number;
  currency: 'GBP';
  allowanceRemaining: number | null;
  withinAllowance: boolean;
  /** Server-side: false when the org may not run this job (e.g. spend cap). Optional. */
  allowed?: boolean;
  /** Server-side: false when the job would exceed the org's spend cap. Optional. */
  withinSpendCap?: boolean;
  note?: string;
  /** Prepaid credit balance (upcoming). Optional. */
  creditBalanceGBP?: number | null;
} & CreditExpiryFields;

export type GlossaryTerms = Record<
  string,
  { doNotTranslate?: boolean; note?: string; [locale: string]: string | boolean | undefined }
>;

export type TranslateItem = {
  key: string;
  /** Source text with ICU args/tags masked as __TONGUE_n__ tokens. */
  text: string;
  description?: string;
  maxLength?: number;
};

export type TranslateRequest = {
  sourceLocale: string;
  targetLocales: string[];
  items: TranslateItem[];
  glossary?: GlossaryTerms;
  context?: string;
  placeholderPattern: '__TONGUE_n__';
  idempotencyKey: string;
};

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';

export type Job = {
  id: string;
  status: JobStatus;
  progress: { done: number; total: number };
  results?: Array<{ key: string; locale: string; text: string }>;
  errors?: Array<{ key: string; locale: string; message: string }>;
  billedChars?: number;
};

export type SyncEntry = {
  key: string;
  locale: string;
  text: string;
  /** sha256 of the source string this translation was made from. */
  sourceHash: string;
  updatedAt?: string;
  origin?: 'cli' | 'web' | 'machine';
  /** Dictionary file the key belongs to (keys created on the web default to `<sourceLocale>.json`). */
  file?: string;
};

export type SyncRequest = {
  mode: 'push' | 'pull' | 'both';
  sourceLocale: string;
  cursor?: string;
  /** Source + target strings to upload (push/both). */
  entries?: SyncEntry[];
  /** Keys removed locally (push/both). */
  deletedKeys?: string[];
};

export type SyncResponse = {
  cursor: string;
  /** Remote entries changed since `cursor` (pull/both). */
  entries: SyncEntry[];
  deletedKeys: string[];
  glossary: GlossaryTerms;
  accepted?: number;
};

export const TOP_UP_FALLBACK_URL = 'https://loomlocale.com/dashboard/billing';

/**
 * Prepaid credits expire 12 months after purchase. Assumed shape (canonical):
 * `nextExpiry: "2026-11-20"` (ISO date) + `nextExpiryGBP: 12.5`. Also accepted: amount as
 * `expiringGBP` / `creditExpiringGBP`, or `nextExpiry: { date | at | expiresAt, amountGBP }`.
 */
export type CreditExpiryFields = {
  nextExpiry?: string | { date?: string; at?: string; expiresAt?: string; amountGBP?: number } | null;
  nextExpiryGBP?: number | null;
  expiringGBP?: number | null;
  creditExpiringGBP?: number | null;
};

export function creditExpiry(src: CreditExpiryFields | null | undefined): { date: Date; amountGBP: number | null } | null {
  const ne = src?.nextExpiry;
  if (!ne) return null;
  const raw = typeof ne === 'string' ? ne : (ne.date ?? ne.at ?? ne.expiresAt);
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const amounts = [typeof ne === 'object' ? ne.amountGBP : undefined, src.nextExpiryGBP, src.expiringGBP, src.creditExpiringGBP];
  const amountGBP = amounts.find((a): a is number => typeof a === 'number' && Number.isFinite(a)) ?? null;
  return { date, amountGBP };
}

/** One-line warning when credit expires within `days` (default 30), else null. */
export function creditExpiryWarning(src: CreditExpiryFields | null | undefined, now: Date = new Date(), days = 30): string | null {
  const e = creditExpiry(src);
  if (!e || e.amountGBP === 0) return null;
  const ms = e.date.getTime() - now.getTime();
  if (ms < 0 || ms > days * 86_400_000) return null;
  const left = Math.ceil(ms / 86_400_000);
  const amt = e.amountGBP != null ? `£${e.amountGBP.toFixed(2)} of Loomlocale credit` : 'Loomlocale credit';
  return `⚠ ${amt} expires on ${e.date.toISOString().slice(0, 10)} (${left === 1 ? 'in 1 day' : `in ${left} days`}) — credits expire 12 months after purchase.`;
}

export class ApiError extends Error {
  /** From Retry-After on 429/503. */
  retryAfterMs: number | null = null;
  /** `details` from the error body, if any. */
  details: unknown = undefined;
  /** Top-up link for 402 insufficient_credit. */
  topUpUrl: string | null = null;
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ClientOptions = {
  baseURL?: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Retries on 429/503/network errors (default 5). */
  maxRetries?: number;
  /** Base backoff in ms (default 500); doubled per attempt, full jitter, capped at 30s. */
  backoffMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called before each retry wait. */
  onRetry?: (info: { attempt: number; waitMs: number; status: number; path: string }) => void;
};

const MAX_BACKOFF_MS = 30_000;

/** Parse Retry-After (delta-seconds or HTTP-date) → ms, or null. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

/** Exponential backoff with full jitter; Retry-After wins when present (plus small jitter). */
export function backoffDelay(attempt: number, retryAfterMs: number | null, baseMs = 500, random: () => number = Math.random): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs + Math.floor(random() * 250), 5 * 60_000);
  const cap = Math.min(MAX_BACKOFF_MS, baseMs * 2 ** attempt);
  return Math.floor(cap / 2 + random() * (cap / 2));
}

export class LoomlocaleClient {
  readonly baseURL: string;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onRetry: ClientOptions['onRetry'];
  /** Shared rate-limit gate: concurrent workers wait here after a 429/503. */
  private pausedUntil = 0;

  constructor(opts: ClientOptions = {}) {
    this.maxRetries = Math.max(0, opts.maxRetries ?? 5);
    this.backoffMs = opts.backoffMs ?? 500;
    this.sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
    this.onRetry = opts.onRetry;
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = opts.token ?? null;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.userAgent = opts.userAgent ?? 'next-tongue-cli/1';
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts: { auth?: boolean; allowError?: boolean; headers?: Record<string, string>; retry?: boolean } = {},
  ): Promise<{ status: number; data: T }> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.pausedUntil - Date.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await this.requestOnce<T>(method, path, body, opts);
      } catch (err) {
        const retryable =
          opts.retry !== false && err instanceof ApiError && (err.status === 429 || err.status === 503 || err.status === 0) && err.code !== 'timeout';
        if (!retryable || attempt >= this.maxRetries) throw err;
        const waitMs = backoffDelay(attempt, (err as ApiError).retryAfterMs ?? null, this.backoffMs, this.random);
        if ((err as ApiError).status !== 0) this.pausedUntil = Math.max(this.pausedUntil, Date.now() + waitMs);
        this.onRetry?.({ attempt: attempt + 1, waitMs, status: (err as ApiError).status, path });
        await this.sleep(waitMs);
      }
    }
  }

  private async requestOnce<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    opts: { auth?: boolean; allowError?: boolean; headers?: Record<string, string> },
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.userAgent,
      ...opts.headers,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.auth !== false) {
      if (!this.token) {
        throw new TongueError(
          'TONGUE_E_CONFIG',
          'Not logged in. Run `tongue login` (or set LOOMLOCALE_TOKEN in CI).',
        );
      }
      headers.authorization = `Bearer ${this.token}`;
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseURL}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new ApiError(0, 'network', `Cannot reach ${this.baseURL}: ${err instanceof Error ? err.message : err}`);
    }
    const text = await res.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: 'invalid_json', message: text.slice(0, 200) };
      }
    }
    if (res.status === 429 || res.status === 503) {
      const d = data as { error?: string; message?: string };
      const e = new ApiError(res.status, d.error ?? (res.status === 429 ? 'rate_limited' : 'unavailable'), `Loomlocale API ${method} ${path} → ${res.status} ${d.message ?? 'rate limited / unavailable'} (retries exhausted)`);
      e.retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      throw e;
    }
    if (!res.ok && !opts.allowError) {
      const d = data as { error?: string; message?: string; error_description?: string; details?: unknown; topUpUrl?: string; top_up_url?: string };
      const code = d.error ?? `http_${res.status}`;
      if (res.status === 402 && code === 'insufficient_credit') {
        const det = (d.details && typeof d.details === 'object' ? d.details : {}) as { topUpUrl?: string; top_up_url?: string; balanceGBP?: number; creditBalanceGBP?: number; requiredGBP?: number };
        const url = det.topUpUrl ?? det.top_up_url ?? d.topUpUrl ?? d.top_up_url ?? TOP_UP_FALLBACK_URL;
        const bits = [d.message ?? 'Not enough prepaid credit for this run'];
        const bal = typeof det.balanceGBP === 'number' ? det.balanceGBP : det.creditBalanceGBP;
        if (typeof bal === 'number') bits.push(`balance £${bal.toFixed(2)}`);
        if (typeof det.requiredGBP === 'number') bits.push(`needed £${det.requiredGBP.toFixed(2)}`);
        const e = new ApiError(402, code, `Insufficient Loomlocale credit — ${bits.join(', ')}. Nothing more was translated. Top up at ${url} and re-run.`);
        e.details = d.details;
        e.topUpUrl = url;
        throw e;
      }
      const hint = res.status === 401 ? ' (run `tongue login`)' : res.status === 402 ? ' (plan allowance exhausted — top up at loomlocale.com/billing)' : '';
      const e = new ApiError(res.status, code, `Loomlocale API ${method} ${path} → ${res.status} ${d.message ?? d.error_description ?? code}${hint}`);
      e.details = d.details;
      throw e;
    }
    return { status: res.status, data: data as T };
  }

  deviceCode(): Promise<DeviceCodeResponse> {
    return this.request<DeviceCodeResponse>('POST', '/device/code', { client_id: CLIENT_ID, scope: DEFAULT_SCOPES }, { auth: false }).then((r) => r.data);
  }

  async deviceToken(deviceCode: string): Promise<DeviceTokenSuccess | DeviceTokenError> {
    const r = await this.request<DeviceTokenSuccess | DeviceTokenError>(
      'POST',
      '/device/token',
      { client_id: CLIENT_ID, device_code: deviceCode, grant_type: DEVICE_GRANT },
      { auth: false, allowError: true, retry: false },
    );
    if (r.status >= 500) throw new ApiError(r.status, 'server_error', `device/token → ${r.status}`);
    return r.data;
  }

  me(): Promise<Me> {
    return this.request<Me>('GET', '/me').then((r) => r.data);
  }

  listProjects(): Promise<Project[]> {
    return this.request<{ projects: Project[] }>('GET', '/projects').then((r) => r.data.projects ?? []);
  }

  createProject(input: { name: string; sourceLocale: string; targetLocales: string[] }): Promise<Project> {
    return this.request<{ project: Project }>('POST', '/projects', input).then((r) => r.data.project);
  }

  estimate(projectId: string, req: EstimateRequest): Promise<Estimate> {
    return this.request<Estimate>('POST', `/projects/${encodeURIComponent(projectId)}/estimate`, req).then((r) => r.data);
  }

  /**
   * Idempotency-Key header (and body field) lets retries/resumes return the same job.
   * A 409 conflict means the key was already used for a different request: retry once with a fresh key.
   */
  async translate(projectId: string, req: TranslateRequest): Promise<Job> {
    const send = (r: TranslateRequest) =>
      this.request<{ job: Job }>('POST', `/projects/${encodeURIComponent(projectId)}/translate`, r, {
        headers: { 'idempotency-key': r.idempotencyKey },
      }).then((x) => x.data.job);
    try {
      return await send(req);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) throw err;
      const fresh = `${req.idempotencyKey.slice(0, 40)}-${Date.now().toString(36)}${Math.floor(this.random() * 1e9).toString(36)}`;
      this.onRetry?.({ attempt: 1, waitMs: 0, status: 409, path: 'translate (idempotency key reused — new key)' });
      return send({ ...req, idempotencyKey: fresh });
    }
  }

  job(id: string): Promise<Job> {
    return this.request<{ job: Job }>('GET', `/jobs/${encodeURIComponent(id)}`).then((r) => r.data.job);
  }

  sync(projectId: string, req: SyncRequest): Promise<SyncResponse> {
    return this.request<SyncResponse>('POST', `/projects/${encodeURIComponent(projectId)}/sync`, req).then((r) => ({
      cursor: r.data.cursor,
      entries: r.data.entries ?? [],
      deletedKeys: r.data.deletedKeys ?? [],
      glossary: r.data.glossary ?? {},
      ...(r.data.accepted != null ? { accepted: r.data.accepted } : {}),
    }));
  }

  /** Poll a job until it leaves queued/running. */
  async waitForJob(
    id: string,
    opts: { intervalMs?: number; timeoutMs?: number; onProgress?: (job: Job) => void; sleep?: (ms: number) => Promise<void> } = {},
  ): Promise<Job> {
    const sleep = opts.sleep ?? this.sleep;
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
    for (;;) {
      const job = await this.job(id);
      opts.onProgress?.(job);
      if (job.status !== 'queued' && job.status !== 'running') return job;
      if (Date.now() > deadline) throw new ApiError(0, 'timeout', `Job ${id} did not finish in time`);
      await sleep(opts.intervalMs ?? 1000);
    }
  }
}

/** Local estimate when the API is unreachable / not logged in. */
export function localCostGBP(chars: number, perMillion = 25): number {
  return Math.round((chars / 1_000_000) * perMillion * 100) / 100;
}
