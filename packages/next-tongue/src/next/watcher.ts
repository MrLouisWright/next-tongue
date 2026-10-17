import {
  watch,
  type FSWatcher,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ResolvedTongueConfig } from '../config/types.js';
import { buildMessages } from '../compiler/build.js';

const GLOBAL_KEY = '__next_tongue_watcher__';

type WatcherState = {
  watcher: FSWatcher;
  lockPath: string;
  cwd: string;
};

declare global {
  var __next_tongue_watcher__: WatcherState | undefined;
}

/** @internal test helper */
export function __getWatcherState(): WatcherState | undefined {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: WatcherState;
  };
  return g[GLOBAL_KEY];
}

/**
 * Single fs.watch across workers, guarded by a lockfile (research A9 / #23).
 * No child processes — runs in-process inside withTongue.
 */
export function startDevWatcher(config: ResolvedTongueConfig, cwd: string): void {
  if (process.env.NODE_ENV === 'production') return;

  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: WatcherState;
  };
  if (g[GLOBAL_KEY]) return;

  const lockPath = resolve(cwd, config.outDir, '.watch.lock');
  mkdirSync(dirname(lockPath), { recursive: true });

  if (existsSync(lockPath)) {
    try {
      const prev = Number(readFileSync(lockPath, 'utf8').trim());
      if (prev && prev !== process.pid) {
        try {
          process.kill(prev, 0);
          return;
        } catch {
          unlinkSync(lockPath);
        }
      } else {
        unlinkSync(lockPath);
      }
    } catch {
      try {
        unlinkSync(lockPath);
      } catch {
        return;
      }
    }
  }

  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    return;
  }

  const messagesGlob = resolve(
    cwd,
    config.messages.replaceAll('{locale}', '*').replaceAll('{namespace}', '*'),
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

  g[GLOBAL_KEY] = { watcher, lockPath, cwd };

  const cleanup = () => {
    stopDevWatcher();
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

/** Close watcher and remove lockfile (also used by tests). */
export function stopDevWatcher(): void {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: WatcherState;
  };
  const state = g[GLOBAL_KEY];
  if (!state) return;
  try {
    state.watcher.close();
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(state.lockPath);
  } catch {
    /* ignore */
  }
  delete g[GLOBAL_KEY];
}
