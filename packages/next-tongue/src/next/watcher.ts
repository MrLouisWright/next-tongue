import { watch, type FSWatcher } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import type { ResolvedTongueConfig } from '../config/types.js';
import { buildMessages } from '../compiler/build.js';

const GLOBAL_KEY = '__next_tongue_watcher__';

type WatcherState = {
  watcher: FSWatcher;
  lockPath: string;
};

declare global {
  var __next_tongue_watcher__: WatcherState | undefined;
}

/**
 * Single fs.watch across workers, guarded by a lockfile (research A9).
 */
export function startDevWatcher(config: ResolvedTongueConfig, cwd: string): void {
  if (process.env.NODE_ENV === 'production') return;

  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: WatcherState;
  };
  if (g[GLOBAL_KEY]) return;

  const lockPath = resolve(cwd, config.outDir, '.watch.lock');
  mkdirSync(dirname(lockPath), { recursive: true });

  try {
    if (existsSync(lockPath)) {
      // Another worker holds the lock
      return;
    }
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    return;
  }

  const messagesGlob = resolve(
    cwd,
    config.messages.replace('{locale}', '*').replace('{namespace}', '*'),
  );
  const watchDir = dirname(messagesGlob);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void buildMessages({ config, cwd, idempotent: false }).catch((err) => {
        console.error('[next-tongue] watch rebuild failed:', err);
      });
    }, 50);
  };

  let watcher: FSWatcher;
  try {
    watcher = watch(watchDir, { recursive: true }, rebuild);
  } catch {
    watcher = watch(watchDir, rebuild);
  }

  g[GLOBAL_KEY] = { watcher, lockPath };

  const cleanup = () => {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    delete g[GLOBAL_KEY];
  };

  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}
