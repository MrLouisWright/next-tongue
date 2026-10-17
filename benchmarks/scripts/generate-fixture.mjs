#!/usr/bin/env node
/**
 * Generate a 500-key message catalog (3 locales) for tree-shake / bundle benchmarks.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'fixtures', 'messages');
mkdirSync(out, { recursive: true });

const KEY_COUNT = 500;
const locales = {
  en: (i) => `Message ${i} for {name}`,
  de: (i) => `Nachricht ${i} für {name}`,
  fr: (i) => `Message ${i} pour {name}`,
};

for (const [locale, make] of Object.entries(locales)) {
  const catalog = { bench: {} };
  for (let i = 0; i < KEY_COUNT; i++) {
    catalog.bench[`k${i}`] = make(i);
  }
  writeFileSync(join(out, `${locale}.json`), JSON.stringify(catalog, null, 2));
}

writeFileSync(
  join(root, 'fixtures', 'tongue.config.mjs'),
  `export default {
  locales: ['en', 'de', 'fr'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  timeZone: 'UTC',
  outDir: './.tongue',
};
`,
);

writeFileSync(
  join(root, 'fixtures', 'client-entry.js'),
  `// Simulates a client component that only calls 2 of 500 keys.
import { k0 } from './.tongue/msg/bench/k0.js';
import { k1 } from './.tongue/msg/bench/k1.js';

export function render(locale, name) {
  return k0(locale, { name }) + ' | ' + k1(locale, { name });
}
`,
);

console.log(`Generated ${KEY_COUNT} keys × ${Object.keys(locales).length} locales → ${out}`);
