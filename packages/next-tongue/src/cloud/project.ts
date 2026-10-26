/** Shared context for cloud commands: config, dictionaries, client, token. */
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from '../config/load-config.js';
import type { ResolvedTongueConfig } from '../config/types.js';
import { TongueError } from '../errors.js';
import { DEFAULT_BASE_URL, LoomlocaleClient, type ClientOptions } from './api.js';
import { createCredentialStore, resolveToken, type CredentialStore } from './credentials.js';

export type CloudGlobals = {
  cwd?: string;
  config?: string;
  baseURL?: string;
  quiet?: boolean;
  json?: boolean;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  store?: CredentialStore;
  pollIntervalMs?: number;
  /** Injected for tests (retry sleep/backoff). */
  clientOptions?: Partial<ClientOptions>;
};

export function resolveBaseURL(opts: CloudGlobals, config?: ResolvedTongueConfig): string {
  const env = opts.env ?? process.env;
  return (opts.baseURL ?? env.LOOMLOCALE_API_URL ?? config?.cloud.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export async function makeClient(opts: CloudGlobals, config?: ResolvedTongueConfig, requireAuth = true): Promise<LoomlocaleClient> {
  const baseURL = resolveBaseURL(opts, config);
  const env = opts.env ?? process.env;
  const token = await resolveToken(baseURL, env, opts.store ?? createCredentialStore(env));
  if (!token && requireAuth) {
    throw new TongueError('TONGUE_E_CONFIG', 'Not logged in to Loomlocale. Run `tongue login` (CI: set LOOMLOCALE_TOKEN).');
  }
  const maxRetries = config?.cloud.maxRetries;
  return new LoomlocaleClient({
    baseURL,
    token,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(maxRetries != null ? { maxRetries } : {}),
    onRetry: ({ attempt, waitMs, status }) => {
      if (!opts.quiet && !opts.json) {
        console.error(`  ${status === 0 ? 'connection dropped' : `HTTP ${status}`} — retrying in ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt})`);
      }
    },
    ...opts.clientOptions,
  });
}

export type ProjectContext = {
  cwd: string;
  config: ResolvedTongueConfig;
  configPath: string | undefined;
  patterns: string[];
  sourceLocale: string;
  targetLocales: string[];
  lockPath: string;
};

export async function loadProject(opts: CloudGlobals): Promise<ProjectContext> {
  const loaded = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });
  const { config, cwd } = loaded;
  return {
    cwd,
    config,
    configPath: await findConfigFile(cwd, opts.config),
    patterns: config.cloud.files?.length ? [...config.cloud.files] : [config.messages],
    sourceLocale: config.defaultLocale,
    targetLocales: config.locales.filter((l) => l !== config.defaultLocale),
    lockPath: config.translate?.lockfile ?? './tongue.lock',
  };
}

const CONFIG_NAMES = ['tongue.config.ts', 'tongue.config.mts', 'tongue.config.js', 'tongue.config.mjs', 'tongue.config.cjs'];

export async function findConfigFile(cwd: string, explicit?: string): Promise<string | undefined> {
  if (explicit) return join(cwd, explicit);
  for (const n of CONFIG_NAMES) {
    try {
      await access(join(cwd, n));
      return join(cwd, n);
    } catch {
      /* next */
    }
  }
  return undefined;
}

/** Insert/replace the `cloud: { … }` block in a tongue.config source file. */
export function upsertCloudBlock(src: string, cloud: { projectId?: string; files?: string[]; baseURL?: string }): string {
  const parts: string[] = [];
  if (cloud.projectId) parts.push(`projectId: ${JSON.stringify(cloud.projectId)}`);
  if (cloud.files?.length) parts.push(`files: ${JSON.stringify(cloud.files)}`);
  if (cloud.baseURL) parts.push(`baseURL: ${JSON.stringify(cloud.baseURL)}`);
  const block = `cloud: {\n    ${parts.join(',\n    ')},\n  }`;
  const head = /cloud\s*:\s*\{/.exec(src);
  if (head) {
    const end = matchBrace(src, head.index + head[0].length - 1);
    if (end > 0) return `${src.slice(0, head.index)}${block}${src.slice(end + 1)}`;
  }
  const open = /(defineConfig\(\s*\{|export\s+default\s*\{|module\.exports\s*=\s*\{)/.exec(src);
  if (!open) throw new TongueError('TONGUE_E_CONFIG', 'Could not find the config object to add `cloud` to — add it manually.');
  const at = open.index + open[0].length;
  return `${src.slice(0, at)}\n  ${block},${src.slice(at)}`;
}

/** Index of the `}` matching the `{` at `open` (string-aware), or -1. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

export async function writeCloudConfig(path: string, cloud: { projectId?: string; files?: string[]; baseURL?: string }): Promise<void> {
  const src = await readFile(path, 'utf8');
  await writeFile(path, upsertCloudBlock(src, cloud), 'utf8');
}

export function openBrowser(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CI === 'true' || env.LOOMLOCALE_NO_BROWSER === '1') return false;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function formatGBP(n: number): string {
  return `£${n.toFixed(2)}`;
}
