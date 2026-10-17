#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');
const rows = [];
for (const name of readdirSync(resultsDir)) {
  if (!name.endsWith('.json') || name === 'summary.json') continue;
  rows.push(JSON.parse(readFileSync(join(resultsDir, name), 'utf8')));
}
rows.sort((a, b) => a.bytesGz - b.bytesGz);

const summary = {
  measuredAt: new Date().toISOString(),
  scenario: '2 of 500 keys × 3 locales, esbuild minify + gzip',
  rows: rows.map((r) => ({
    library: r.library,
    proxyFor: r.proxyFor,
    bytes: r.bytes,
    bytesGz: r.bytesGz,
  })),
};

writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Benchmark summary (ascending gz):');
for (const r of summary.rows) {
  console.log(`  ${String(r.bytesGz).padStart(5)} B gz  ${r.library}${r.proxyFor ? ` (${r.proxyFor})` : ''}`);
}
