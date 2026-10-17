/**
 * Accept-Language negotiation microbench for #18.
 * Target: p50 < 1 ms, p99 < 3 ms with 150 locales.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Prefer built dist; fall back to vitest-style TS via dynamic import of source through Node won't work.
// Build first in CI; locally use dist after `pnpm build`.
const matcherUrl = pathToFileURL(
  join(root, 'dist/proxy/locale-matcher.js'),
).href;

const { createLocaleMatcher } = await import(matcherUrl);

const locales = Array.from({ length: 150 }, (_, i) => {
  if (i === 0) return 'en';
  if (i === 1) return 'de';
  if (i === 2) return 'fr';
  if (i === 3) return 'zh-Hant';
  if (i === 4) return 'pt-BR';
  return `l${i}`;
});

const headers = [
  'en-US,en;q=0.9,de;q=0.8',
  'de-DE,de;q=0.9,en;q=0.5',
  'fr-FR,fr;q=0.8,en;q=0.6',
  'zh-Hant-HK,zh;q=0.8,en;q=0.5',
  'pt-BR,pt;q=0.9,en;q=0.4',
  'ja,en;q=0.8',
  'l42,en;q=0.1',
  'xx-YY,yy;q=0.5',
  'en',
  'de-AT,de;q=0.9,en-GB;q=0.8,en;q=0.7,fr;q=0.3',
];

const matcher = createLocaleMatcher(locales);
const iterations = 20_000;
const samples = [];

// warmup
for (let i = 0; i < 1_000; i++) {
  matcher.match(headers[i % headers.length]);
}

for (let i = 0; i < iterations; i++) {
  const h = headers[i % headers.length];
  const t0 = performance.now();
  matcher.match(h);
  samples.push(performance.now() - t0);
}

samples.sort((a, b) => a - b);
const pct = (p) => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))];

const result = {
  locales: locales.length,
  iterations,
  p50_ms: Number(pct(50).toFixed(4)),
  p95_ms: Number(pct(95).toFixed(4)),
  p99_ms: Number(pct(99).toFixed(4)),
  max_ms: Number(samples[samples.length - 1].toFixed(4)),
  targets: { p50_ms: 1, p99_ms: 3 },
};

const outDir = join(root, '../../benchmarks/results');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'locale-matcher.json');
writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

const ok = result.p50_ms < 1 && result.p99_ms < 3;
console.log(JSON.stringify(result, null, 2));
console.log(ok ? 'PASS: within p50<1ms p99<3ms' : 'FAIL: exceeded latency targets');
if (!ok) process.exit(1);
