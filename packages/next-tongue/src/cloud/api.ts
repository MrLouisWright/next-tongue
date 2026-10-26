/**
 * Typed client for the Loomlocale hosted API (next-tongue 1.0).
 * Contract: docs/api-contract.md. Zero runtime deps: uses global fetch.
 */
import { TongueError } from '../errors.js';

export const DEFAULT_BASE_URL = 'https://loomlocale.com/api/v1';
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export const CLIENT_ID = 'next-tongue-cli';

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
};

export type Me = {
  user: { id: string; email: string; name?: string };
  org: { id: string; name: string };
  plan: Plan;
};

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
};

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

export class ApiError extends Error {
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
};

export class LoomlocaleClient {
  readonly baseURL: string;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(opts: ClientOptions = {}) {
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = opts.token ?? null;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.userAgent = opts.userAgent ?? 'next-tongue-cli/1';
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts: { auth?: boolean; allowError?: boolean } = {},
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.userAgent,
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
    if (!res.ok && !opts.allowError) {
      const d = data as { error?: string; message?: string; error_description?: string };
      const code = d.error ?? `http_${res.status}`;
      const hint = res.status === 401 ? ' (run `tongue login`)' : res.status === 402 ? ' (plan allowance exhausted — top up at loomlocale.com/billing)' : '';
      throw new ApiError(res.status, code, `Loomlocale API ${method} ${path} → ${res.status} ${d.message ?? d.error_description ?? code}${hint}`);
    }
    return { status: res.status, data: data as T };
  }

  deviceCode(): Promise<DeviceCodeResponse> {
    return this.request<DeviceCodeResponse>('POST', '/device/code', { client_id: CLIENT_ID, scope: 'projects translate sync' }, { auth: false }).then((r) => r.data);
  }

  async deviceToken(deviceCode: string): Promise<DeviceTokenSuccess | DeviceTokenError> {
    const r = await this.request<DeviceTokenSuccess | DeviceTokenError>(
      'POST',
      '/device/token',
      { client_id: CLIENT_ID, device_code: deviceCode, grant_type: DEVICE_GRANT },
      { auth: false, allowError: true },
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

  translate(projectId: string, req: TranslateRequest): Promise<Job> {
    return this.request<{ job: Job }>('POST', `/projects/${encodeURIComponent(projectId)}/translate`, req).then((r) => r.data.job);
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
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
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
