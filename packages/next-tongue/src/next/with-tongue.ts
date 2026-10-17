import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/load-config.js';
import { startDevWatcher } from './watcher.js';

export type WithTongueOptions = {
  config?: string;
  /** Skip codegen (unit tests). */
  skipBuild?: boolean;
};

type NextConfigLike = Record<string, unknown> & {
  turbopack?: {
    rules?: Record<string, unknown>;
    resolveAlias?: Record<string, string>;
  };
  webpack?: (
    config: WebpackConfigLike,
    ctx: { dev: boolean; isServer: boolean },
  ) => WebpackConfigLike;
};

type WebpackConfigLike = {
  resolve?: { alias?: Record<string, string> };
  module?: { rules?: unknown[] };
};

/**
 * Config wrapper (not a bundler plugin): runs codegen when Next loads config,
 * registers the per-file call-site loader, maps `#tongue/*` → outDir.
 */
export function withTongue<T extends NextConfigLike>(
  nextConfig: T = {} as T,
  options: WithTongueOptions = {},
): T {
  const cwd = process.cwd();
  const outDir = resolve(cwd, '.tongue');
  const loaderPath = resolveLoaderPath();

  if (!options.skipBuild) {
    runCodegenSync(cwd, options.config);
    // Start watcher asynchronously after config resolves
    void loadConfig({
      cwd,
      ...(options.config != null ? { configPath: options.config } : {}),
    })
      .then(({ config, cwd: configCwd }) => {
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
  }

  const turbopack = {
    ...(nextConfig.turbopack ?? {}),
    resolveAlias: {
      ...(nextConfig.turbopack?.resolveAlias ?? {}),
      '#tongue': outDir,
    },
    rules: {
      ...(nextConfig.turbopack?.rules ?? {}),
      '*.{tsx,jsx,ts,js}': {
        loaders: [
          {
            loader: loaderPath,
            options: { outDir: '.tongue' },
          },
        ],
        condition: {
          all: [{ not: 'foreign' }, 'browser'],
          content: 'useT(',
        },
      },
    },
  };

  const userWebpack = nextConfig.webpack;
  const webpack = (
    config: WebpackConfigLike,
    ctx: { dev: boolean; isServer: boolean },
  ) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '#tongue': outDir,
    };
    if (!ctx.isServer) {
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
    }
    return userWebpack ? userWebpack(config, ctx) : config;
  };

  return {
    ...nextConfig,
    turbopack,
    webpack,
  };
}

function resolveLoaderPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, 'loader.js');
  if (existsSync(candidate)) return candidate;
  return candidate;
}

function runCodegenSync(cwd: string, configPath?: string): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const bin = resolve(here, '../../bin/tongue.js');
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
