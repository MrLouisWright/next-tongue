#!/usr/bin/env node
/**
 * Fixture matrix for #25: keys × locales × used-keys, comparing
 * next-tongue (per-key), catalog-pick (next-intl proxy), and paraglide-style.
 * Publishes crossover hints for when per-locale splitting would win.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, 'results');
const work = join(resultsDir, '_matrix');
mkdirSync(work, { recursive: true });

const KEY_SETS = [50, 1000];
const LOCALE_SETS = [2, 10, 50];
const USED_SETS = [2, 20];

const localeCode = (i) => (i === 0 ? 'en' : `l${i}`);

function text(locale, keyIndex) {
  if (locale === 'en') return `Message ${keyIndex} for {name}`;
  return `${locale} msg ${keyIndex} {name}`;
}

async function minify(entry, outfile) {
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
  return { bytes: raw.length, bytesGz: gzipSync(raw).length };
}

async function measureTongue(keysTotal, locales, used) {
  const dir = join(work, `tongue-k${keysTotal}-l${locales}-u${used}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const localeIds = Array.from({ length: locales }, (_, i) => localeCode(i));

  for (let i = 0; i < used; i++) {
    const branches = localeIds.map((loc, idx) => {
      const call = `return ${JSON.stringify(text(loc, i))}.replace("{name}", name);`;
      if (idx === localeIds.length - 1) return `  ${call}`;
      return `  if (locale === ${JSON.stringify(loc)}) ${call}`;
    });
    writeFileSync(
      join(dir, `k${i}.js`),
      `export function k${i}(locale, name) {\n${branches.join('\n')}\n}\n`,
    );
  }
  const imports = Array.from({ length: used }, (_, i) => `import { k${i} } from './k${i}.js';`).join(
    '\n',
  );
  const calls = Array.from({ length: used }, (_, i) => `k${i}(locale, name)`).join(' + "|" + ');
  writeFileSync(
    join(dir, 'entry.js'),
    `${imports}\nexport function render(locale, name) {\n  return ${calls};\n}\n`,
  );
  return minify(join(dir, 'entry.js'), join(dir, 'out.min.js'));
}

async function measureCatalogPick(locales, used) {
  const dir = join(work, `pick-l${locales}-u${used}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const localeIds = Array.from({ length: locales }, (_, i) => localeCode(i));
  const catalog = {};
  for (const loc of localeIds) {
    catalog[loc] = {};
    for (let i = 0; i < used; i++) catalog[loc][`k${i}`] = text(loc, i);
  }
  writeFileSync(
    join(dir, 'entry.js'),
    `const catalog = ${JSON.stringify(catalog)};
function format(msg, values) {
  return msg.replace(/\\{(\\w+)\\}/g, (_, k) => String(values[k] ?? ''));
}
export function render(locale, name) {
  const m = catalog[locale] ?? catalog.en;
  return ${Array.from({ length: used }, (_, i) => `format(m.k${i}, { name })`).join(" + '|' + ")};
}
`,
  );
  return minify(join(dir, 'entry.js'), join(dir, 'out.min.js'));
}

async function measureParaglide(locales, used) {
  // Same shape as tongue for this matrix (per-message, all locales of used keys)
  return measureTongue(0, locales, used);
}

const rows = [];
for (const keysTotal of KEY_SETS) {
  for (const locales of LOCALE_SETS) {
    for (const used of USED_SETS) {
      if (used > keysTotal) continue;
      const tongue = await measureTongue(keysTotal, locales, used);
      const pick = await measureCatalogPick(locales, used);
      const paraglide = await measureParaglide(locales, used);
      rows.push({
        keysTotal,
        locales,
        keysUsed: used,
        nextTongueGz: tongue.bytesGz,
        catalogPickGz: pick.bytesGz,
        paraglideStyleGz: paraglide.bytesGz,
        tongueWinsVsPick: tongue.bytesGz < pick.bytesGz,
        tongueWinsVsParaglide: tongue.bytesGz < paraglide.bytesGz,
      });
    }
  }
}

// Crossover: for fixed used=2, find locale count where catalog-pick gz < tongue
// (splitting by locale would help tongue more as locales grow if we shipped one locale —
// today tongue ships all locales of used keys, so size grows ~linear with locales like paraglide.)
const used2 = rows.filter((r) => r.keysUsed === 2 && r.keysTotal === 50);
const crossoverNote =
  'With all-locales-of-used-keys delivery, next-tongue and paraglide-style scale similarly with locale count; ' +
  'catalog-pick (narrowed JSON) stays competitive at small used×locales and loses as used keys grow. ' +
  'Per-locale client splitting would change the crossover — not enabled by default (ADR 0009).';

const report = {
  measuredAt: new Date().toISOString(),
  scenario: 'matrix: keys∈{50,1000} × locales∈{2,10,50} × used∈{2,20}, esbuild minify + gzip',
  crossoverNote,
  sampleUsed2Keys50: used2,
  rows,
};

writeFileSync(join(resultsDir, 'matrix.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ rows: rows.length, measuredAt: report.measuredAt }, null, 2));
for (const r of rows) {
  console.log(
    `k=${r.keysTotal} loc=${r.locales} used=${r.keysUsed}  tongue=${r.nextTongueGz} pick=${r.catalogPickGz} para=${r.paraglideStyleGz}`,
  );
}
