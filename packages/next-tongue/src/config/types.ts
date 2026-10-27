export type StrictLevel = 'error' | 'warn' | 'off';

export type LocaleCookieConfig = {
  name: string;
  maxAge: number;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  path?: string;
};

export type DomainConfig = {
  domain: string;
  defaultLocale: string;
  locales: readonly string[];
};

export type PseudoConfig = {
  locale?: string;
  enabled?: 'dev' | 'always' | false;
  expand?: number;
};

/** `false` disables; `true` / object enables (dev only). */
export type DevOverlayOption =
  | boolean
  | {
      /** Preset (`vscode` | `cursor` | `webstorm`) or `{file}`/`{line}` template. */
      editor?: string;
    };

export type ResolvedDevOverlay =
  | false
  | {
      editor: string;
    };

export type TongueConfig = {
  locales: readonly string[];
  defaultLocale: string;
  messages?: string;
  fallback?: Partial<Record<string, string>>;
  timeZone?: string;
  sources?: Array<() => Promise<Record<string, Record<string, Record<string, string>>>>>;
  sourcesOnError?: 'fail' | 'use-cache';
  pseudo?: PseudoConfig | boolean;
  client?: { split?: 'none' | 'locale' };
  devOverlay?: DevOverlayOption;
  routing?: {
    prefix?: 'always' | 'as-needed' | 'never';
    localeDetection?: boolean;
    localeCookie?: LocaleCookieConfig | false;
    domains?: DomainConfig[];
    pathnames?: Record<string, Partial<Record<string, string>>>;
    /**
     * Opt-in: `getT(ns)` / `getFormat()` resolve locale from `next/root-params`
     * (ADR 0007 / #24). Explicit `getT(locale, ns)` always works.
     */
    rootParams?: boolean;
  };
  formats?: {
    number?: Record<string, Intl.NumberFormatOptions>;
    dateTime?: Record<string, Intl.DateTimeFormatOptions>;
    list?: Record<string, Intl.ListFormatOptions>;
  };
  outDir?: string;
  /**
   * Directories scanned by `tongue check` / `extract` for `getT`/`useT` call sites.
   * Defaults to app, src, components, lib, server, actions.
   */
  scan?: {
    include?: string[];
  };
  strict?: {
    missing?: StrictLevel;
    unused?: StrictLevel;
    /** Full keys or globs (`common.*`) excluded from unused warnings. */
    unusedIgnore?: string[];
    mismatch?: StrictLevel;
    a11y?: StrictLevel;
    bidi?: StrictLevel;
    stale?: StrictLevel;
    length?: StrictLevel;
  };
  /**
   * Translation options (1.0: translations run through the Loomlocale API;
   * BYO OpenAI `baseURL` / `model` / `apiKeyEnv` were removed — stay on 0.9 for those).
   */
  translate?: {
    glossary?: string;
    lockfile?: string;
    context?: string;
    /** Refuse runs whose billable characters (source chars × targets) exceed this. */
    maxChars?: number;
  };
  /** Loomlocale cloud project link, written by `tongue link` / the wizard. */
  cloud?: CloudConfig;
};

export type CloudConfig = {
  projectId?: string;
  /** API base URL. Default https://www.loomlocale.com/api/v1 (env LOOMLOCALE_API_URL overrides). */
  baseURL?: string;
  /** Dictionary patterns with `{locale}` (e.g. `./locales/{locale}/*.json`). Defaults to `messages`. */
  files?: string[];
  /** Spending cap enforced against the estimate before translating (env/flags override per run caps). */
  budget?: CloudBudget;
  /** Locales translated in parallel (default: all). `--concurrency` overrides. */
  concurrency?: number;
  /** Max keys per translate request (default 100). */
  batchSize?: number;
  /** Max source characters per translate request (default 20000). */
  batchChars?: number;
  /** Retries on 429/503/network errors with Retry-After + exponential backoff (default 5). */
  maxRetries?: number;
};

export type CloudBudget = {
  /** Max billable characters per run. */
  maxChars?: number;
  /** Max estimated cost (GBP) per run. */
  maxCostGBP?: number;
  /** Max characters used this billing period, including this run. */
  monthlyChars?: number;
  /** Max estimated spend (GBP) this billing period, including this run. */
  monthlyCostGBP?: number;
};

export type ResolvedTongueConfig = {
  locales: readonly string[];
  defaultLocale: string;
  messages: string;
  fallback: Partial<Record<string, string>>;
  timeZone: string;
  sources: Array<() => Promise<Record<string, Record<string, Record<string, string>>>>>;
  sourcesOnError: 'fail' | 'use-cache';
  pseudo: false | Required<PseudoConfig>;
  client: { split: 'none' | 'locale' };
  devOverlay: ResolvedDevOverlay;
  routing: {
    prefix: 'always' | 'as-needed' | 'never';
    localeDetection: boolean;
    localeCookie: LocaleCookieConfig | false;
    domains: DomainConfig[] | undefined;
    pathnames: Record<string, Partial<Record<string, string>>> | undefined;
    rootParams: boolean;
  };
  formats: {
    number: Record<string, Intl.NumberFormatOptions>;
    dateTime: Record<string, Intl.DateTimeFormatOptions>;
    list: Record<string, Intl.ListFormatOptions>;
  };
  outDir: string;
  scan: {
    include: readonly string[];
  };
  strict: {
    missing: StrictLevel;
    unused: StrictLevel;
    unusedIgnore: readonly string[];
    mismatch: StrictLevel;
    a11y: StrictLevel;
    bidi: StrictLevel;
    stale: StrictLevel;
    length: StrictLevel;
  };
  translate: TongueConfig['translate'];
  cloud: CloudConfig;
};
