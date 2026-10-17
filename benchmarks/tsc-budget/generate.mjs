#!/usr/bin/env node
/**
 * Generate a 10k-key TongueRegister fixture for tsc budget (#6 / ADR 0004).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'fixture');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, '.tongue'), { recursive: true });
mkdirSync(join(out, 'src'), { recursive: true });

const NS_COUNT = 10;
const KEYS_PER_NS = 1000; // 10k keys total
const CALL_COUNT = 50;

const nsBlocks = [];
for (let n = 0; n < NS_COUNT; n++) {
  const ns = `ns${n}`;
  const keys = [];
  for (let k = 0; k < KEYS_PER_NS; k++) {
    if (k % 5 === 0) {
      keys.push(`      "k${k}": { "name": string | number };`);
    } else if (k % 5 === 1) {
      keys.push(`      "k${k}": { "count": number };`);
    } else {
      keys.push(`      "k${k}": Record<string, never>;`);
    }
  }
  nsBlocks.push(`    "${ns}": {\n${keys.join('\n')}\n    };`);
}

const types = `/* eslint-disable */
// Generated for tsc budget — do not edit.
declare module 'next-tongue' {
  interface TongueRegister {
    locales: "en" | "de";
    ns: {
${nsBlocks.join('\n')}
    };
    pathnames: string;
  }
}
export {};
`;

writeFileSync(join(out, '.tongue', 'types.d.ts'), types);

// Consumer with 50 typed t() calls into one namespace (indexes, not full-union filter)
const calls = Array.from({ length: CALL_COUNT }, (_, i) => {
  const key = `k${i * 10}`;
  if (i % 5 === 0) return `  s += t('${key}', { name: 'Ada' });`;
  if (i % 5 === 1) return `  s += t('${key}', { count: ${i} });`;
  return `  s += t('${key}');`;
}).join('\n');

writeFileSync(
  join(out, 'src', 'with-i18n.ts'),
  `import type { TFunction } from 'next-tongue/server';
import type { Namespace } from 'next-tongue';

declare const t: TFunction<'ns0'>;
declare const _ns: Namespace;

export function render(): string {
  let s = '';
${calls}
  return s;
}
`,
);

writeFileSync(
  join(out, 'src', 'baseline.ts'),
  `export function render(): string {
  let s = '';
${Array.from({ length: CALL_COUNT }, (_, i) => `  s += 'k${i * 10}';`).join('\n')}
  return s;
}
`,
);

writeFileSync(
  join(out, 'tsconfig.with-i18n.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        paths: {
          'next-tongue': ['../../../packages/next-tongue/dist/index.d.ts'],
          'next-tongue/*': ['../../../packages/next-tongue/dist/*'],
        },
      },
      include: ['src/with-i18n.ts', '.tongue/types.d.ts'],
    },
    null,
    2,
  ),
);

writeFileSync(
  join(out, 'tsconfig.baseline.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src/baseline.ts'],
    },
    null,
    2,
  ),
);

writeFileSync(
  join(out, 'package.json'),
  JSON.stringify({ name: '@next-tongue/tsc-budget-fixture', private: true, type: 'module' }, null, 2),
);

console.log(`Generated ${NS_COUNT * KEYS_PER_NS} keys × ${NS_COUNT} namespaces → ${out}`);
