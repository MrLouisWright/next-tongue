#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, '..', '..', 'results');
mkdirSync(resultsDir, { recursive: true });

const outfile = join(resultsDir, 'lingui.min.js');
await esbuild({
  entryPoints: [join(root, 'src', 'client-entry.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  outfile,
  treeShaking: true,
});

const raw = readFileSync(outfile);
const report = {
  library: 'lingui',
  config: '@lingui/core + catalog narrowed to 2 keys × 3 locales (best-case pick)',
  keysTotal: 500,
  keysUsed: 2,
  locales: 3,
  bytes: raw.length,
  bytesGz: gzipSync(raw).length,
  measuredAt: new Date().toISOString(),
  note: 'Includes @lingui/core runtime. Catalog is manually narrowed to k0/k1 (SWC macro tree-shake would be similar for static ids).',
};

writeFileSync(join(resultsDir, 'lingui.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
