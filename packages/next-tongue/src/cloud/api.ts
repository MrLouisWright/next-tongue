/**
 * Typed client for the Loomlocale hosted API (next-tongue 1.0).
 * Contract: docs/api-contract.md. Zero runtime deps: uses global fetch.
 */
import { TongueError } from '../errors.js';

export const DEFAULT_BASE_URL = 'https://www.loomlocale.com/api/v1';
/** Device-login page, used when the server omits verification_uri. */
export const DEVICE_PAGE_URL = 'https://www.loomlocale.com/device';
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
  /** Server: free | credits | subscription. `payg` from older servers. */
  kind: 'free' | 'credits' | 'subscription' | 'payg';
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
  /** Prepaid credit summary. Optional. */
  credit?: {
    creditBalanceGBP?: number;
    lowCredit?: boolean;
    creditLots?: Array<{ remainingGBP?: number; expiresAt?: string; expiringSoon?: boolean; [k: string]: unknown }>;
    topUpUrl?: string;
    [k: string]: unknown;
  } | null;
  /** Free workspaces: a card on file unlocks a one-time allowance. All optional. */
  cardOnFile?: boolean;
  freeAllowanceClaimed?: boolean;
  /** Only sent while the free allowance is unclaimed. */
  cardSetupUrl?: string | null;
  allowanceType?: 'once' | 'monthly' | (string & {});
  allowanceRemaining?: number | null;
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
  /** Same glossary record the translate call sends, so translation-memory hits match (server a5fb584). */
  glossary?: GlossaryTerms;
};

export type EstimatePerLocale = { chars: number; texts: number; memoryHits: number };

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
  /** Server-side: false when prepaid credit doesn't cover the run. Optional. */
  withinCredit?: boolean;
  /** Credit this run would reserve (0 when not prepaid). Optional. */
  creditRequiredGBP?: number;
  /** Top-up link when `withinCredit` is false. Optional. */
  topUpUrl?: string;
  /** Deprecated alias of `withinCredit`; only read when `withinCredit` is absent. */
  withinSpendCap?: boolean;
  note?: string;
  /** Prepaid credit balance (upcoming). Optional. */
  creditBalanceGBP?: number | null;
  /** Before translation memory: unique texts × target locales (server a5fb584+). `chars` is after memory. */
  grossChars?: number;
  /** grossChars − chars: covered by cached translations, not billed. */
  memoryChars?: number;
  perLocale?: Record<string, EstimatePerLocale>;
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
  /** Server reason when `status` is `failed` (string or `{ code, message }`); optional. */
  error?: string | { code?: string; message?: string } | null;
  message?: string;
};

/** Server-provided failure reason for a job, if any. */
export function jobErrorMessage(job: Pick<Job, 'error' | 'message' | 'errors'>): string | null {
  if (typeof job.error === 'string' && job.error) return job.message ? `${job.error}: ${job.message}` : job.error;
  if (job.error && typeof job.error === 'object') return job.error.message ?? job.error.code ?? null;
  if (job.message) return job.message;
  const first = job.errors?.[0];
  return first ? first.message : null;
}

/** A job did not reach a final state in time (overall timeout, or no progress for too long). */
export class JobTimeoutError extends Error {
  constructor(
    readonly jobId: string,
    readonly lastStatus: string,
    readonly waitedMs: number,
    readonly reason: 'timeout' | 'stalled',
  ) {
    super(
      `Loomlocale job ${jobId} is still ${lastStatus} after ${Math.round(waitedMs / 1000)}s${reason === 'stalled' ? ' with no progress' : ''}.`,
    );
    this.name = 'JobTimeoutError';
  }
}

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

export const TOP_UP_FALLBACK_URL = 'https://www.loomlocale.com/dashboard/billing';

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

type ErrorBody = {
  error?: string;
  message?: string;
  error_description?: string;
  details?: Record<string, unknown>;
  request_id?: string;
  topUpUrl?: string;
  top_up_url?: string;
};

/**
 * Error bodies are flat (`{ error: "<code>", message, details?, request_id }`); a nested
 * `{ error: { code, message, details, request_id } }` is accepted too, defensively.
 */
export function normalizeErrorBody(data: unknown): ErrorBody {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const inner = d.error && typeof d.error === 'object' ? (d.error as Record<string, unknown>) : null;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);
  const out: ErrorBody = {};
  const pick = <K extends keyof ErrorBody>(k: K, v: ErrorBody[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  pick('error', inner ? (str(inner.code) ?? str(inner.error)) : str(d.error));
  pick('message', str(inner?.message) ?? str(d.message));
  pick('error_description', str(d.error_description));
  pick('details', obj(inner?.details) ?? obj(d.details));
  pick('request_id', str(inner?.request_id) ?? str(d.request_id));
  pick('topUpUrl', str(inner?.topUpUrl) ?? str(d.topUpUrl));
  pick('top_up_url', str(d.top_up_url));
  return out;
}

/** The `402 insufficient_credit` error (also raised before translating when the estimate says `withinCredit: false`). CLI exit code 4. */
export function insufficientCreditError(a: { requiredGBP?: number | undefined; balanceGBP?: number | undefined; topUpUrl?: string | undefined; requestId?: string | undefined }): ApiError {
  const url = a.topUpUrl ?? TOP_UP_FALLBACK_URL;
  const bits: string[] = [];
  if (typeof a.requiredGBP === 'number') bits.push(`this run needs ${gbpPrecise(a.requiredGBP)}`);
  if (typeof a.balanceGBP === 'number') bits.push(`balance is ${gbpPrecise(a.balanceGBP)}`);
  const rid = a.requestId ? ` (request id ${a.requestId})` : '';
  const e = new ApiError(402, 'insufficient_credit', `Insufficient Loomlocale credit${bits.length ? `: ${bits.join(', ')}` : ''}. Nothing more was translated. Top up at ${url} and re-run.${rid}`);
  e.topUpUrl = url;
  e.requestId = a.requestId ?? null;
  return e;
}

export const CARD_SETUP_FALLBACK_URL = 'https://www.loomlocale.com/dashboard/billing';

/** `402 card_required`: free workspace must add a card to claim its one-time allowance. CLI exit code 4. */
export function cardRequiredError(a: { message?: string | undefined; setupUrl?: string | undefined; requestId?: string | undefined }): ApiError {
  const url = a.setupUrl ?? CARD_SETUP_FALLBACK_URL;
  const rid = a.requestId ? ` (request id ${a.requestId})` : '';
  const msg = (a.message ?? 'A card is required to claim the free allowance').replace(/\.?\s*$/, '');
  const e = new ApiError(402, 'card_required', `${msg}. Nothing more was translated. Add a card at ${url} and re-run (finished batches are kept).${rid}`);
  e.topUpUrl = url;
  e.requestId = a.requestId ?? null;
  return e;
}

/** Exit code 4: billing action needed (insufficient credit, card required). */
export function isBillingActionError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 402 && (err.code === 'insufficient_credit' || err.code === 'card_required');
}

/** Lines for whoami/status: unclaimed free allowance hint + allowance remaining. */
export function allowanceLines(me: Pick<Me, 'cardOnFile' | 'freeAllowanceClaimed' | 'cardSetupUrl' | 'allowanceType' | 'allowanceRemaining'> | null | undefined): string[] {
  if (!me) return [];
  const out: string[] = [];
  if (me.freeAllowanceClaimed === false) {
    out.push(`Add a card to claim your free one-time 50,000-character allowance: ${me.cardSetupUrl ?? CARD_SETUP_FALLBACK_URL}`);
  }
  if (typeof me.allowanceRemaining === 'number' && Number.isFinite(me.allowanceRemaining)) {
    const kind = me.allowanceType === 'once' ? 'one-time ' : me.allowanceType === 'monthly' ? 'monthly ' : '';
    out.push(`Allowance remaining: ${me.allowanceRemaining.toLocaleString('en-GB')} chars (${kind}allowance)`.replace(' ()', ''));
  }
  return out;
}

const gbpPrecise = (n: number) => `£${n !== 0 && Math.abs(n) < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

/** Sums per-locale estimates. Credit: required amounts add up, so the sum is checked against the balance. */
export function aggregateEstimates(ests: Estimate[]): Pick<Estimate, 'chars' | 'billableChars' | 'costGBP'> &
  Partial<Pick<Estimate, 'grossChars' | 'memoryChars' | 'perLocale' | 'allowed' | 'withinSpendCap' | 'withinCredit' | 'creditRequiredGBP' | 'creditBalanceGBP' | 'topUpUrl' | 'note' | 'allowanceRemaining' | 'withinAllowance'>> {
  const out: ReturnType<typeof aggregateEstimates> = { chars: 0, billableChars: 0, costGBP: 0 };
  for (const e of ests) {
    if (typeof e.allowanceRemaining === 'number') out.allowanceRemaining = e.allowanceRemaining; // org-wide, not per locale
    if (typeof e.withinAllowance === 'boolean') out.withinAllowance = (out.withinAllowance ?? true) && e.withinAllowance;
    out.chars += e.chars;
    if (typeof e.grossChars === 'number') out.grossChars = (out.grossChars ?? 0) + e.grossChars;
    if (typeof e.memoryChars === 'number') out.memoryChars = (out.memoryChars ?? 0) + e.memoryChars;
    if (e.perLocale) out.perLocale = { ...out.perLocale, ...e.perLocale };
    out.billableChars += e.billableChars;
    out.costGBP += e.costGBP;
    if (e.allowed === false) out.allowed = false;
    if (e.withinSpendCap === false) out.withinSpendCap = false;
    if (typeof e.withinCredit === 'boolean') out.withinCredit = (out.withinCredit ?? true) && e.withinCredit;
    if (typeof e.creditRequiredGBP === 'number') out.creditRequiredGBP = (out.creditRequiredGBP ?? 0) + e.creditRequiredGBP;
    if (typeof e.creditBalanceGBP === 'number') out.creditBalanceGBP = e.creditBalanceGBP;
    if (e.topUpUrl) out.topUpUrl = e.topUpUrl;
    if (e.note && !out.note) out.note = e.note;
  }
  if (out.withinCredit === true && out.creditRequiredGBP != null && out.creditBalanceGBP != null && out.creditRequiredGBP > out.creditBalanceGBP + 1e-9) out.withinCredit = false;
  return out;
}

/**
 * Human estimate lines from the server's figures (`chars`, `billableChars`, `costGBP`,
 * `allowanceRemaining`). Chars covered by the allowance = chars − billableChars; the allowance
 * left after the run = allowanceRemaining (before the run, per the contract) − covered.
 */
export function describeEstimate(est: Pick<Estimate, 'chars' | 'billableChars' | 'costGBP'> & Partial<Pick<Estimate, 'allowanceRemaining' | 'withinAllowance'>>, fmtGBP: (n: number) => string): { included: boolean; text: string } {
  const n = (x: number) => Math.max(0, Math.round(x)).toLocaleString('en-GB');
  const billable = Math.max(0, Math.min(est.chars, est.billableChars));
  const covered = est.chars - billable;
  const left = typeof est.allowanceRemaining === 'number' ? Math.max(0, est.allowanceRemaining - covered) : null;
  const leftText = left != null ? `${n(left)} chars of allowance left after this run` : null;
  if (billable === 0 && (est.withinAllowance !== false || est.costGBP <= 0)) {
    return { included: true, text: `Included in your plan: uses ${n(covered)} chars of your allowance${leftText ? ` (${leftText})` : ''}` };
  }
  if (covered > 0) {
    return { included: false, text: `${n(covered)} of ${n(est.chars)} chars covered by your allowance; estimated cost ${fmtGBP(est.costGBP)} for the remaining ${n(billable)} billable chars${leftText ? ` (${leftText})` : ''}` };
  }
  return { included: false, text: `Estimated cost ${fmtGBP(est.costGBP)} (${n(billable)} billable chars)` };
}

/** What a run needs, to decide whether a low-credit hint is relevant. */
export type CreditNeed = { chars?: number; billableChars?: number; costGBP?: number; creditRequiredGBP?: number; withinAllowance?: boolean };

/** True when the run (per server estimate, or else the free allowance on /me) needs no prepaid credit. */
export function runNeedsNoCredit(
  me: { plan?: Me['plan'] | undefined; allowanceRemaining?: number | null | undefined } | null | undefined,
  need: CreditNeed | null | undefined,
): boolean {
  if (!need) return false;
  if (typeof need.creditRequiredGBP === 'number') return need.creditRequiredGBP <= 0;
  if (need.withinAllowance === true || need.billableChars === 0) return true;
  if (typeof need.costGBP === 'number' && typeof need.billableChars === 'number') return need.costGBP <= 0;
  if (typeof need.chars === 'number') {
    const left =
      typeof me?.allowanceRemaining === 'number'
        ? me.allowanceRemaining
        : me?.plan && (me.plan.kind === 'free' || me.plan.kind === 'subscription') && typeof me.plan.charsIncluded === 'number'
          ? me.plan.charsIncluded - (me.plan.charsUsed ?? 0)
          : null;
    if (left != null && need.chars <= left) return true;
  }
  return false;
}

/**
 * Hint when `/me` says credit is low (`credit.lowCredit`). Pass `need` (the run's estimate) to
 * suppress it when the run is covered by the allowance and needs no credit (e.g. Free plans at £0).
 */
export function lowCreditHint(
  me: (Pick<Me, 'credit' | 'creditBalanceGBP'> & { plan?: Me['plan'] | undefined; allowanceRemaining?: number | null | undefined }) | null | undefined,
  need?: CreditNeed | null,
): string | null {
  if (!me?.credit?.lowCredit) return null;
  if (need !== undefined && runNeedsNoCredit(me, need)) return null;
  const bal = me.creditBalanceGBP ?? me.credit.creditBalanceGBP;
  return `Loomlocale credit is low${typeof bal === 'number' ? ` (${gbpPrecise(bal)})` : ''}. Top up at ${me.credit.topUpUrl ?? TOP_UP_FALLBACK_URL}.`;
}

export class ApiError extends Error {
  /** From Retry-After on 429/503. */
  retryAfterMs: number | null = null;
  /** `details` from the error body, if any. */
  details: unknown = undefined;
  /** Top-up link for 402 insufficient_credit. */
  topUpUrl: string | null = null;
  /** `request_id` from the error body (quote it to Loomlocale support). */
  requestId: string | null = null;
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
  /** Called before each retry wait. `message` is a human line, e.g. "Loomlocale reset the connection (POST /sync), retrying 1/2". */
  onRetry?: (info: { attempt: number; waitMs: number; status: number; path: string; message?: string }) => void;
  /** Per-request timeouts in ms (1.0.5). Defaults: 60s for /sync, /estimate, /me and other calls; 30s for job polls. */
  timeouts?: Partial<RequestTimeouts>;
  /** Cap on the total time one call may spend retrying (default 3 min). */
  retryBudgetMs?: number;
};

export type RequestTimeouts = { sync: number; estimate: number; me: number; poll: number; default: number };
export const DEFAULT_TIMEOUTS: RequestTimeouts = { sync: 60_000, estimate: 60_000, me: 60_000, poll: 30_000, default: 60_000 };
/** Retries after an immediate ECONNRESET / ECONNREFUSED (connection never got a response). */
export const MAX_RESET_RETRIES = 2;
const IMMEDIATE_MS = 5_000;
const RESET_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'UND_ERR_SOCKET', 'EPIPE']);

/** AbortSignal.timeout with a fallback for runtimes without it (it exists from Node 17.3). */
export function timeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal };
  if (typeof AS.timeout === 'function') return AS.timeout(ms);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })), ms);
  (t as { unref?: () => void }).unref?.();
  return c.signal;
}

/** errno-style code of a fetch failure (undici puts it on `cause`, sometimes nested). */
export function networkErrorCode(err: unknown): string | null {
  let e: unknown = err;
  for (let i = 0; i < 4 && e && typeof e === 'object'; i++) {
    const o = e as { code?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof o.code === 'string') return o.code;
    e = o.cause ?? o.errors?.[0];
  }
  return null;
}

const fmtSec = (ms: number) => `${Math.round(ms / 1000)}s`;

/** Nothing-billed hint for a failed call (translate jobs are idempotent: the same key never bills twice). */
export function nothingBilledHint(method: string, path: string): string {
  if (/\/translate$/.test(path)) return 'Re-running `tongue update` reuses the same idempotency key, so nothing is billed twice.';
  return `Nothing was billed for ${method} ${path.replace(/\/projects\/[^/]+/, '/projects/…')}; re-run \`tongue update\` to resume.`;
}

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
  private readonly timeouts: RequestTimeouts;
  private readonly retryBudgetMs: number;
  /** Shared rate-limit gate: concurrent workers wait here after a 429/503. */
  private pausedUntil = 0;

  constructor(opts: ClientOptions = {}) {
    this.maxRetries = Math.max(0, opts.maxRetries ?? 5);
    this.backoffMs = opts.backoffMs ?? 500;
    this.sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
    this.onRetry = opts.onRetry;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
    this.retryBudgetMs = opts.retryBudgetMs ?? 180_000;
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = opts.token ?? null;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.userAgent = opts.userAgent ?? 'next-tongue-cli/1';
  }

  /** Timeout for one request: 60s for /sync, /estimate, /me; 30s for job polls (1.0.5). */
  timeoutFor(method: string, path: string): number {
    if (method === 'GET' && path.startsWith('/jobs/')) return this.timeouts.poll;
    if (path.endsWith('/sync')) return this.timeouts.sync;
    if (path.endsWith('/estimate')) return this.timeouts.estimate;
    if (path === '/me') return this.timeouts.me;
    return this.timeouts.default;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts: { auth?: boolean; allowError?: boolean; headers?: Record<string, string>; retry?: boolean } = {},
  ): Promise<{ status: number; data: T }> {
    const started = Date.now();
    // Safe to repeat: GETs and sync pulls. A /sync push, /translate etc. are only retried when the server said so (429/503)
    // or the connection failed before any response could have been produced (immediate reset/refused).
    const idempotent = method === 'GET' || (path.endsWith('/sync') && (body as { mode?: string } | undefined)?.mode === 'pull');
    const label = `${method} ${path}`;
    let resets = 0;
    for (let attempt = 0; ; attempt++) {
      const wait = this.pausedUntil - Date.now();
      if (wait > 0) await this.sleep(wait);
      const t0 = Date.now();
      try {
        return await this.requestOnce<T>(method, path, body, opts);
      } catch (err) {
        if (opts.retry === false || !(err instanceof ApiError) || attempt >= this.maxRetries) throw err;
        let retryable = false;
        let reason = '';
        if (err.code === 'timeout') retryable = false; // never retried (a /sync push may still be running server-side)
        else if (err.status === 429 || err.status === 503) {
          retryable = true;
          reason = `Loomlocale is busy (HTTP ${err.status}, ${label})`;
        } else if ((err.status === 502 || err.status === 504) && idempotent) {
          retryable = true;
          reason = `Loomlocale gateway error (HTTP ${err.status}, ${label})`;
        } else if (err.status === 0 && err.code === 'network') {
          const immediate = Date.now() - t0 < IMMEDIATE_MS;
          const resetLike = RESET_CODES.has(networkErrorCode(err.cause) ?? '') || idempotent;
          if (immediate && resetLike && resets < MAX_RESET_RETRIES) {
            resets++;
            retryable = true;
            reason = `Loomlocale reset the connection (${label}), retrying ${resets}/${MAX_RESET_RETRIES}`;
          }
        }
        if (!retryable) {
          if (err.status === 0 && !/Nothing was billed|nothing is billed/.test(err.message)) err.message += `. ${nothingBilledHint(method, path)}`;
          throw err;
        }
        const waitMs = backoffDelay(attempt, err.retryAfterMs ?? null, this.backoffMs, this.random);
        if (Date.now() - started + waitMs > this.retryBudgetMs) {
          err.message += ` (gave up after ${fmtSec(Date.now() - started)} of retries). ${nothingBilledHint(method, path)}`;
          throw err;
        }
        if (err.status !== 0) this.pausedUntil = Math.max(this.pausedUntil, Date.now() + waitMs);
        this.onRetry?.({ attempt: attempt + 1, waitMs, status: err.status, path, message: reason });
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
    const timeoutMs = this.timeoutFor(method, path);
    const asError = (err: unknown): ApiError => {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        return new ApiError(0, 'timeout', `Loomlocale didn't answer within ${fmtSec(timeoutMs)} (${method} ${path}). Not retried`);
      }
      const code = networkErrorCode(err);
      const e = new ApiError(0, 'network', `Cannot reach ${this.baseURL} (${method} ${path}): ${code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' ? 'connection reset by the server' : code === 'ECONNREFUSED' ? 'connection refused' : err instanceof Error ? err.message : String(err)}`);
      (e as { cause?: unknown }).cause = err;
      return e;
    };
    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(`${this.baseURL}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: timeoutSignal(timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      throw asError(err);
    }
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: 'invalid_json', message: text.slice(0, 200) };
      }
    }
    if (res.status === 502 || res.status === 504) {
      const d = normalizeErrorBody(data);
      const e = new ApiError(res.status, d.error ?? (res.status === 504 ? 'gateway_timeout' : 'bad_gateway'), `Loomlocale API ${method} ${path} → ${res.status} ${d.message ?? (res.status === 504 ? 'gateway timeout' : 'bad gateway')}`);
      if (!opts.allowError) throw e;
    }
    if (res.status === 429 || res.status === 503) {
      const d = normalizeErrorBody(data);
      const e = new ApiError(res.status, d.error ?? (res.status === 429 ? 'rate_limited' : 'unavailable'), `Loomlocale API ${method} ${path} → ${res.status} ${d.message ?? 'rate limited / unavailable'} (retries exhausted)`);
      e.retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      throw e;
    }
    if (!res.ok && !opts.allowError) {
      const d = normalizeErrorBody(data);
      const code = d.error ?? `http_${res.status}`;
      const rid = d.request_id ? ` (request id ${d.request_id})` : '';
      if (res.status === 402 && code === 'card_required') {
        const det = (d.details ?? {}) as { setupUrl?: string; cardSetupUrl?: string };
        const e = cardRequiredError({ message: d.message, setupUrl: det.setupUrl ?? det.cardSetupUrl, requestId: d.request_id });
        e.details = d.details;
        throw e;
      }
      if (res.status === 402 && code === 'insufficient_credit') {
        const det = (d.details ?? {}) as { topUpUrl?: string; top_up_url?: string; balanceGBP?: number; creditBalanceGBP?: number; requiredGBP?: number };
        const e = insufficientCreditError({
          requiredGBP: det.requiredGBP,
          balanceGBP: typeof det.balanceGBP === 'number' ? det.balanceGBP : det.creditBalanceGBP,
          topUpUrl: det.topUpUrl ?? det.top_up_url ?? d.topUpUrl ?? d.top_up_url,
          requestId: d.request_id,
        });
        e.details = d.details;
        throw e;
      }
      const hint = res.status === 401 ? ' (run `tongue login`)' : res.status === 402 && code !== 'spend_cap_reached' ? ` (top up at ${TOP_UP_FALLBACK_URL})` : '';
      const e = new ApiError(res.status, code, `Loomlocale API ${method} ${path} → ${res.status} ${d.message ?? d.error_description ?? code}${hint}${rid}`);
      e.details = d.details;
      e.requestId = d.request_id ?? null;
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
    opts: {
      intervalMs?: number;
      /** Overall limit (default 30 min). */
      timeoutMs?: number;
      /** Give up when status/progress has not changed for this long (default 10 min). */
      stallTimeoutMs?: number;
      onProgress?: (job: Job, info: { elapsedMs: number }) => void;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    } = {},
  ): Promise<Job> {
    const sleep = opts.sleep ?? this.sleep;
    const now = opts.now ?? Date.now;
    const start = now();
    const timeout = opts.timeoutMs ?? 30 * 60_000;
    const stall = opts.stallTimeoutMs ?? 10 * 60_000;
    let lastSig = '';
    let lastChange = start;
    for (;;) {
      const job = await this.job(id);
      const t = now();
      opts.onProgress?.(job, { elapsedMs: t - start });
      if (job.status !== 'queued' && job.status !== 'running') return job;
      const sig = `${job.status}:${job.progress?.done ?? 0}`;
      if (sig !== lastSig) {
        lastSig = sig;
        lastChange = t;
      }
      if (t - start >= timeout) throw new JobTimeoutError(id, job.status, t - start, 'timeout');
      if (t - lastChange >= stall) throw new JobTimeoutError(id, job.status, t - start, 'stalled');
      await sleep(opts.intervalMs ?? 1000);
    }
  }
}

/** Local estimate when the API is unreachable / not logged in. */
export function localCostGBP(chars: number, perMillion = 25): number {
  return Math.round((chars / 1_000_000) * perMillion * 100) / 100;
}
