#!/usr/bin/env node
/**
 * Write PO catalogs (500 keys × 3 locales) and a client entry that only
 * activates k0 + k1 — Lingui's best-case narrowed catalog.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_COUNT = 500;

const texts = {
  en: (i) => `Message ${i} for {name}`,
  de: (i) => `Nachricht ${i} für {name}`,
  fr: (i) => `Message ${i} pour {name}`,
};

for (const locale of Object.keys(texts)) {
  const dir = join(root, 'locales', locale);
  mkdirSync(dir, { recursive: true });
  const entries = [];
  for (let i = 0; i < KEY_COUNT; i++) {
    const id = `k${i}`;
    const msgstr = texts[locale](i).replace(/\{/g, '{').replace(/\}/g, '}');
    // Lingui PO uses {name} placeholders
    entries.push(`msgid "${id}"\nmsgstr "${msgstr.replace(/"/g, '\\"')}"\n`);
  }
  writeFileSync(
    join(dir, 'messages.po'),
    `msgid ""\nmsgstr ""\n"Language: ${locale}\\n"\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n${entries.join('\n')}`,
  );
}

// Narrowed JSON catalogs for best-case client measure (2 keys × 3 locales)
const narrowed = {};
for (const locale of Object.keys(texts)) {
  narrowed[locale] = {
    messages: {
      k0: texts[locale](0),
      k1: texts[locale](1),
    },
  };
}
mkdirSync(join(root, 'src'), { recursive: true });
writeFileSync(join(root, 'src', 'narrowed.json'), JSON.stringify(narrowed));

writeFileSync(
  join(root, 'src', 'client-entry.js'),
  `import { i18n } from '@lingui/core';
import narrowed from './narrowed.json';

export function render(locale, name) {
  i18n.load(locale, narrowed[locale].messages);
  i18n.activate(locale);
  return i18n._({ id: 'k0', message: '', values: { name } }) + ' | ' +
    i18n._({ id: 'k1', message: '', values: { name } });
}
`,
);

console.log(`Generated ${KEY_COUNT} keys × 3 locales + narrowed client entry`);
