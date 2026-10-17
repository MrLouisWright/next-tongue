#!/usr/bin/env node
/**
 * Build next-tongue messages for the 500-key fixture and measure esbuild
 * min+gz size of a client entry that imports only 2 keys.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';
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

const outfile = join(resultsDir, 'tongue-client.min.js');
await esbuild({
  entryPoints: [join(fixtures, 'client-entry.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  outfile,
  // Tree-shake unused per-key modules
  treeShaking: true,
});

const raw = readFileSync(outfile);
const gz = gzipSync(raw);
const report = {
  library: 'next-tongue',
  keysTotal: 500,
  keysUsed: 2,
  locales: 3,
  bytes: raw.length,
  bytesGz: gz.length,
  measuredAt: new Date().toISOString(),
  note: 'Client entry imports only k0 and k1; all locales of those keys are inlined (ADR 0009).',
};

writeFileSync(join(resultsDir, 'tongue.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
