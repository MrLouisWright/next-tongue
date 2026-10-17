#!/usr/bin/env node
/**
 * Baseline: what a runtime-catalog library ships when the provider is narrowed
 * to 2 keys × all locales (next-intl `pick`-style best practice).
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, 'results');
mkdirSync(resultsDir, { recursive: true });

const locales = ['en', 'de', 'fr'];
const used = ['k0', 'k1'];
const catalog = {};
for (const locale of locales) {
  catalog[locale] = {};
  for (const key of used) {
    const i = key.slice(1);
    catalog[locale][key] =
      locale === 'en'
        ? `Message ${i} for {name}`
        : locale === 'de'
          ? `Nachricht ${i} für {name}`
          : `Message ${i} pour {name}`;
  }
}

const entry = join(resultsDir, 'catalog-pick-entry.js');
writeFileSync(
  entry,
  `const catalog = ${JSON.stringify(catalog)};
function format(msg, values) {
  return msg.replace(/\\{(\\w+)\\}/g, (_, k) => String(values[k] ?? ''));
}
export function render(locale, name) {
  const m = catalog[locale] ?? catalog.en;
  return format(m.k0, { name }) + ' | ' + format(m.k1, { name });
}
`,
);

const outfile = join(resultsDir, 'catalog-pick.min.js');
await esbuild({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  outfile,
  treeShaking: true,
});

const raw = readFileSync(outfile);
const gz = gzipSync(raw);
const report = {
  library: 'runtime-catalog-pick-2-keys',
  proxyFor: 'next-intl with pick() / narrowed provider (best-case catalog size)',
  keysTotal: 500,
  keysUsed: 2,
  locales: 3,
  bytes: raw.length,
  bytesGz: gz.length,
  measuredAt: new Date().toISOString(),
  note: 'Only the 2 used keys × 3 locales are inlined as a JSON catalog + tiny interpolator. No ICU plural runtime.',
};

writeFileSync(join(resultsDir, 'catalog-pick.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
