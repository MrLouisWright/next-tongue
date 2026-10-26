import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { resolveConfig } from './validate.js';
import type { ResolvedTongueConfig, TongueConfig } from './types.js';
import { TongueError } from '../errors.js';

const require = createRequire(import.meta.url);

export type LoadConfigOptions = {
  cwd?: string;
  configPath?: string;
};

const CANDIDATES = [
  'tongue.config.ts',
  'tongue.config.mts',
  'tongue.config.js',
  'tongue.config.mjs',
  'tongue.config.cjs',
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveConfigPath(cwd: string, explicit?: string): Promise<string> {
  if (explicit) {
    const path = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!(await exists(path))) {
      throw new TongueError('TONGUE_E_CONFIG', `Config file not found: ${path}`);
    }
    return path;
  }
  for (const name of CANDIDATES) {
    const path = join(cwd, name);
    if (await exists(path)) return path;
  }
  throw new TongueError(
    'TONGUE_E_CONFIG',
    `No tongue.config.* found in ${cwd}. Run \`tongue init\` or pass --config.`,
  );
}

/**
 * Load and validate tongue.config.*. Supports .ts via Node's native type-stripping
 * (Node 22.6+) or a plain dynamic import for .js/.mjs.
 */
export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<{ config: ResolvedTongueConfig; configPath: string; cwd: string }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const configPath = await resolveConfigPath(cwd, options.configPath);

  let mod: { default?: TongueConfig } & TongueConfig;
  // Cache-bust ESM imports so edits (tongue link / wizard / watch) are seen in-process.
  let bust = '';
  try {
    const st = await stat(configPath);
    bust = `?v=${st.mtimeMs}-${st.size}`;
  } catch {
    /* resolveConfigPath already validated existence */
  }
  try {
    if (configPath.endsWith('.ts') || configPath.endsWith('.mts')) {
      // Prefer jiti if present (devDependency of the app); else Node type-stripping.
      try {
        const jitiMod = require('jiti') as {
          createJiti: (id: string) => { import: (p: string) => Promise<unknown> };
        };
        const jiti = jitiMod.createJiti(import.meta.url);
        mod = (await jiti.import(configPath)) as typeof mod;
      } catch {
        mod = (await import(pathToFileURL(configPath).href + bust)) as typeof mod;
      }
    } else {
      mod = (await import(pathToFileURL(configPath).href + bust)) as typeof mod;
    }
  } catch (err) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `Failed to load config ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const raw = (mod.default ?? mod) as TongueConfig;
  const config = resolveConfig(raw);
  return { config, configPath, cwd: dirname(configPath) === cwd ? cwd : cwd };
}

/** Sync-ish helper for tests: validate an in-memory config object. */
export function loadConfigFromObject(input: TongueConfig): ResolvedTongueConfig {
  return resolveConfig(input);
}

export async function readJsonFile(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as unknown;
}
