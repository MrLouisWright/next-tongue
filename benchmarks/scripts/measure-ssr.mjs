#!/usr/bin/env node
/**
 * SSR micro-benchmark: 1,000 t()-equivalent calls (compiled message fns).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'fixtures');
const resultsDir = join(root, 'results');
mkdirSync(resultsDir, { recursive: true });

const require = createRequire(import.meta.url);
const tongueRoot = dirname(require.resolve('next-tongue/package.json'));
const tongueBin = join(tongueRoot, 'bin/tongue.js');

const build = spawnSync(process.execPath, [tongueBin, 'build', '--cwd', fixtures], {
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(1);
}

const mod = await import(pathToFileURL(join(fixtures, '.tongue/msg/bench/k0.js')).href);
const fn = mod.k0;

const N = 1000;
const warm = 200;
for (let i = 0; i < warm; i++) fn('en', { name: 'Ada' });

const start = performance.now();
for (let i = 0; i < N; i++) fn('en', { name: 'Ada' });
const ms = performance.now() - start;

const report = {
  library: 'next-tongue',
  metric: 'ssr-t-calls',
  calls: N,
  ms,
  msPerCall: ms / N,
  measuredAt: new Date().toISOString(),
  note: '1,000 calls to a compiled plural-free argument message (k0) after warm-up.',
};

writeFileSync(join(resultsDir, 'ssr.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
