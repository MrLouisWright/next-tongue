#!/usr/bin/env node
/**
 * Dev watcher memory soak (#23).
 *
 * Default: 1,000 message edits with a short pause (CI-friendly).
 * Full acceptance: SOAK_MS=1800000 (30 min) with the same edit count.
 *
 * Pass: heapUsed growth < 10% from post-warmup to end; lockfile cleaned on stop.
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgRoot = join(require.resolve('../package.json'), '..');
const distWatcher = join(pkgRoot, 'dist/next/watcher.js');
const distValidate = join(pkgRoot, 'dist/config/validate.js');

const { startDevWatcher, stopDevWatcher, __getWatcherState } = await import(
  pathToFileURL(distWatcher).href
);
const { resolveConfig } = await import(pathToFileURL(distValidate).href);

const EDITS = Number(process.env.SOAK_EDITS ?? 1000);
const SOAK_MS = Number(process.env.SOAK_MS ?? 0); // 0 = as-fast-as-safe
const WARMUP = 20;
const MAX_GROWTH = 0.1;

const dir = mkdtempSync(join(tmpdir(), 'tongue-soak-'));
mkdirSync(join(dir, 'messages'));
const msgPath = join(dir, 'messages', 'en.json');
writeFileSync(msgPath, JSON.stringify({ home: { title: 'Hello {name}' } }, null, 2));

const config = resolveConfig({
  locales: ['en'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  outDir: '.tongue',
});

process.env.NODE_ENV = 'development';
startDevWatcher(config, dir);
const state = __getWatcherState();
if (!state) {
  console.error('watcher failed to start');
  process.exit(1);
}

function heap() {
  return process.memoryUsage().heapUsed;
}

function edit(i) {
  writeFileSync(
    msgPath,
    JSON.stringify({ home: { title: `Hello {name} #${i}` } }, null, 2),
  );
}

const pause =
  SOAK_MS > 0
    ? Math.max(1, Math.floor(SOAK_MS / EDITS))
    : 5; // 5ms between edits ≈ 5s for 1k

for (let i = 0; i < WARMUP; i++) {
  edit(i);
  await new Promise((r) => setTimeout(r, pause));
}
if (global.gc) global.gc();
const baseline = heap();

const t0 = Date.now();
for (let i = 0; i < EDITS; i++) {
  edit(i);
  await new Promise((r) => setTimeout(r, pause));
}
if (global.gc) global.gc();
const after = heap();
const elapsedMs = Date.now() - t0;
const growth = (after - baseline) / baseline;

const lockPath = state.lockPath;
stopDevWatcher();
const lockGone = !existsSync(lockPath);

const report = {
  edits: EDITS,
  pauseMs: pause,
  elapsedMs,
  baselineHeapBytes: baseline,
  afterHeapBytes: after,
  growthRatio: growth,
  maxGrowth: MAX_GROWTH,
  lockCleaned: lockGone,
  ok: growth < MAX_GROWTH && lockGone,
  measuredAt: new Date().toISOString(),
};

const out = join(pkgRoot, '../../benchmarks/results/watcher-soak.json');
try {
  writeFileSync(out, JSON.stringify(report, null, 2));
} catch {
  /* optional path */
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
