#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');
const rows = [];
for (const name of readdirSync(resultsDir)) {
  if (!name.endsWith('.json') || name === 'summary.json') continue;
  const data = JSON.parse(readFileSync(join(resultsDir, name), 'utf8'));
  // Baseline client-bundle rows only (skip matrix / ssr / other shapes)
  if (typeof data.bytesGz !== 'number' || !data.library) continue;
  if (data.metric) continue;
  rows.push(data);
}
rows.sort((a, b) => a.bytesGz - b.bytesGz);

let matrix = null;
let ssr = null;
try {
  matrix = JSON.parse(readFileSync(join(resultsDir, 'matrix.json'), 'utf8'));
} catch {
  /* optional */
}
try {
  ssr = JSON.parse(readFileSync(join(resultsDir, 'ssr.json'), 'utf8'));
} catch {
  /* optional */
}

const summary = {
  measuredAt: new Date().toISOString(),
  scenario: '2 of 500 keys × 3 locales, esbuild minify + gzip',
  rows: rows.map((r) => ({
    library: r.library,
    proxyFor: r.proxyFor,
    bytes: r.bytes,
    bytesGz: r.bytesGz,
  })),
  ssr: ssr
    ? { calls: ssr.calls, ms: ssr.ms, msPerCall: ssr.msPerCall }
    : undefined,
  matrix: matrix
    ? { scenario: matrix.scenario, crossoverNote: matrix.crossoverNote, cells: matrix.rows?.length }
    : undefined,
};

writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Benchmark summary (ascending gz):');
for (const r of summary.rows) {
  console.log(`  ${String(r.bytesGz).padStart(5)} B gz  ${r.library}${r.proxyFor ? ` (${r.proxyFor})` : ''}`);
}
