#!/usr/bin/env node
/**
 * Paraglide-style: one function per (message) with all locales inlined,
 * importing only 2 of 500. Mirrors Paraglide's default "all locales of used
 * messages" delivery without pulling the full inlang toolchain yet.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, 'results');
const genDir = join(resultsDir, 'paraglide-style');
mkdirSync(genDir, { recursive: true });

function emitKey(key, texts) {
  // texts: { en, de, fr }
  return `export function ${key}(locale, name) {
  const t = locale === "de" ? ${JSON.stringify(texts.de)} : locale === "fr" ? ${JSON.stringify(texts.fr)} : ${JSON.stringify(texts.en)};
  return t.replace("{name}", name);
}
`;
}

for (const key of ['k0', 'k1']) {
  const i = key.slice(1);
  writeFileSync(
    join(genDir, `${key}.js`),
    emitKey(key, {
      en: `Message ${i} for {name}`,
      de: `Nachricht ${i} für {name}`,
      fr: `Message ${i} pour {name}`,
    }),
  );
}

const entry = join(genDir, 'entry.js');
writeFileSync(
  entry,
  `import { k0 } from './k0.js';
import { k1 } from './k1.js';
export function render(locale, name) {
  return k0(locale, name) + ' | ' + k1(locale, name);
}
`,
);

const outfile = join(resultsDir, 'paraglide-style.min.js');
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
  library: 'paraglide-style-per-message',
  proxyFor: 'Paraglide JS 2 (per-message functions, all locales of used messages)',
  keysTotal: 500,
  keysUsed: 2,
  locales: 3,
  bytes: raw.length,
  bytesGz: gz.length,
  measuredAt: new Date().toISOString(),
  note: 'Hand-emitted Paraglide-like modules for the same 2×3 fixture; unused keys never imported.',
};

writeFileSync(join(resultsDir, 'paraglide-style.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
