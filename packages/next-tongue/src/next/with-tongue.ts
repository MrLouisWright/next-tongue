import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/load-config.js';
import { startDevWatcher } from './watcher.js';

export type WithTongueOptions = {
  config?: string;
  /** Skip codegen (unit tests). */
  skipBuild?: boolean;
};

type WebpackConfigLike = {
  resolve?: { alias?: Record<string, unknown> };
  module?: { rules?: unknown[] };
};

/**
 * Config wrapper (not a bundler plugin): runs codegen when Next loads config,
 * maps `#tongue/*` → outDir, registers the call-site loader for Turbopack + webpack.
 *
 * Codegen emits `#tongue/runtime` that auto-calls `ensureTongue()` on import;
 * `getT` / `getFormat` also lazy-import that module — no per-page ensureTongue().
 */
export function withTongue<T extends object>(
  nextConfig: T = {} as T,
  options: WithTongueOptions = {},
): T {
  const cwd = process.cwd();
  const outDir = resolve(cwd, '.tongue');
  const loaderPath = resolveLoaderPath();
  const input = nextConfig as T & {
    output?: string;
    experimental?: Record<string, unknown>;
    turbopack?: {
      resolveAlias?: Record<string, unknown>;
      rules?: Record<string, unknown>;
    };
    webpack?: (
      config: WebpackConfigLike,
      ctx: { dev: boolean; isServer: boolean },
    ) => WebpackConfigLike;
  };

  if (!options.skipBuild) {
    runCodegenSync(cwd, options.config);
    warnMissingTongueRuntime(cwd);
    void loadConfig({
      cwd,
      ...(options.config != null ? { configPath: options.config } : {}),
    })
      .then(({ config, cwd: configCwd }) => {
        warnConfigCombos(input, config);
        warnMissingLocaleParams(cwd);
        if (process.env.NODE_ENV !== 'production') {
          startDevWatcher(config, configCwd);
        }
      })
      .catch((err: unknown) => {
        console.warn(
          '[next-tongue] Could not start watcher:',
          err instanceof Error ? err.message : err,
        );
      });
  } else {
    warnMissingTongueRuntime(cwd);
  }

  // Next 16: content must be RegExp; omit `as` when returning the same module type
  // (using `as: '*.tsx'` previously doubled extensions → `file.tsx.tsx`).
  // Do NOT gate on `browser` — client components still SSR, and useT must be
  // rewritten on the server graph too (otherwise SSR throws without loadNamespace).
  const tongueLoaderRule = {
    condition: {
      all: [{ not: 'foreign' }, { content: /useT\s*\(/ }],
    },
    loaders: [
      {
        loader: loaderPath,
        options: { outDir: '.tongue' },
      },
    ],
  };

  const existingRules = input.turbopack?.rules ?? {};
  const turbopack = {
    ...(input.turbopack ?? {}),
    resolveAlias: {
      ...(input.turbopack?.resolveAlias ?? {}),
      '#tongue': outDir,
    },
    // Appends the call-site loader onto any existing `*.tsx` / `*.jsx` rules
    // (Next accepts a rule or an array of rules per glob).
    rules: {
      ...existingRules,
      '*.tsx': appendTurbopackRule(existingRules['*.tsx'], tongueLoaderRule),
      '*.jsx': appendTurbopackRule(existingRules['*.jsx'], tongueLoaderRule),
    },
  };

  const userWebpack = input.webpack;
  const webpack = (
    config: WebpackConfigLike,
    ctx: { dev: boolean; isServer: boolean },
  ) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '#tongue': outDir,
    };
    // Client components SSR under webpack too — apply on both graphs.
    config.module ??= {};
    config.module.rules = [
      ...(config.module.rules ?? []),
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        enforce: 'pre',
        use: [{ loader: loaderPath, options: { outDir: '.tongue' } }],
      },
    ];
    return userWebpack ? userWebpack(config, ctx) : config;
  };

  const enableRootParams = peekRootParamsFlag(cwd, options.config);
  const experimental = enableRootParams
    ? {
        ...(input.experimental ?? {}),
        rootParams: true,
      }
    : input.experimental;

  return {
    ...input,
    ...(experimental ? { experimental } : {}),
    turbopack,
    webpack,
  };
}

/** Merge a tongue loader rule with any pre-existing turbopack rule for the same glob. */
function appendTurbopackRule(
  existing: unknown,
  rule: unknown,
): unknown {
  if (existing == null) return rule;
  return Array.isArray(existing) ? [...existing, rule] : [existing, rule];
}

/** Sync peek: `routing.rootParams: true` in tongue.config (ADR 0007 / #24). */
function peekRootParamsFlag(cwd: string, configPath?: string): boolean {
  const candidates = configPath
    ? [resolve(cwd, configPath)]
    : [
        join(cwd, 'tongue.config.ts'),
        join(cwd, 'tongue.config.mjs'),
        join(cwd, 'tongue.config.js'),
      ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const src = readFileSync(file, 'utf8');
      if (/rootParams\s*:\s*true/.test(src)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function warnConfigCombos(
  nextConfig: { output?: string },
  config: {
    routing: { prefix: string; domains?: unknown };
  },
): void {
  if (nextConfig.output === 'export') {
    if (config.routing.prefix !== 'always') {
      console.warn(
        `[next-tongue] output: 'export' requires routing.prefix: 'always' (got '${config.routing.prefix}')`,
      );
    }
    if (config.routing.domains) {
      console.warn(
        `[next-tongue] output: 'export' does not support routing.domains`,
      );
    }
  }
}

function warnMissingLocaleParams(cwd: string): void {
  const candidates = [
    join(cwd, 'app', '[locale]', 'layout.tsx'),
    join(cwd, 'app', '[locale]', 'layout.ts'),
    join(cwd, 'src', 'app', '[locale]', 'layout.tsx'),
    join(cwd, 'src', 'app', '[locale]', 'layout.ts'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (!/generateStaticParams/.test(src) && !/localeParams/.test(src)) {
      console.warn(
        `[next-tongue] ${file.replace(cwd + '/', '')}: root [locale] layout should export generateStaticParams (e.g. localeParams) for a static shell under cacheComponents`,
      );
    }
    return;
  }
  try {
    const appDir = existsSync(join(cwd, 'app'))
      ? join(cwd, 'app')
      : join(cwd, 'src', 'app');
    if (!existsSync(appDir)) return;
    for (const name of readdirSync(appDir)) {
      if (name.includes('[locale]')) return;
    }
  } catch {
    /* ignore */
  }
}

function resolveLoaderPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, 'loader.js');
}

function warnMissingTongueRuntime(cwd: string): void {
  const runtime = join(cwd, '.tongue', 'runtime.js');
  if (!existsSync(runtime)) {
    console.warn(
      '[next-tongue] `.tongue/runtime.js` is missing. Run `npx tongue build` (or use `"build": "tongue build && next build"`). `next dev` without a recent build leaves getT/useT unwired.',
    );
  }
}

function runCodegenSync(cwd: string, configPath?: string): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const bin = resolve(here, '../../bin/tongue.js');
  if (!existsSync(bin)) {
    console.warn('[next-tongue] CLI bin missing; skip codegen at config load');
    return;
  }
  const args = [bin, 'build', '--cwd', cwd];
  if (configPath) args.push('--config', configPath);
  const r = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || `exit ${r.status}`).trim();
    console.warn(`[next-tongue] tongue build failed at config load: ${msg}`);
  }
}
