#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'messages');
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

console.log(`Generated ${KEY_COUNT} keys × ${Object.keys(locales).length} locales → ${out}`);
