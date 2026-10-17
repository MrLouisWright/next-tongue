#!/usr/bin/env node
/**
 * Extract ```ts typecheck / ```tsx typecheck fences from docs/*.md and
 * type-check them against next-tongue (#16).
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const outDir = join(root, '.docs-samples');

// Prefer `tsx` before `ts` so ```tsx is not captured as ```ts.
const FENCE =
  /```(tsx|ts)[^\n]*\btypecheck\b[^\n]*\n([\s\S]*?)```/g;

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Ambient shims for Next types used in docs samples
  await writeFile(
    join(outDir, 'shims.d.ts'),
    [
      `declare module 'next' {`,
      `  export type Metadata = {`,
      `    title?: string;`,
      `    description?: string;`,
      `    alternates?: unknown;`,
      `    [key: string]: unknown;`,
      `  };`,
      `}`,
      `declare module 'next/cache' {`,
      `  export function cacheTag(...tags: string[]): void;`,
      `  export function cacheLife(profile: string): void;`,
      `}`,
      ``,
    ].join('\n'),
    'utf8',
  );

  const files = (await readdir(docsDir))
    .filter((f) => f.endsWith('.md'))
    .sort();

  let count = 0;
  const index = [];

  for (const file of files) {
    const src = await readFile(join(docsDir, file), 'utf8');
    let m;
    let i = 0;
    FENCE.lastIndex = 0;
    while ((m = FENCE.exec(src)) !== null) {
      const lang = m[1];
      const body = m[2].trimEnd() + '\n';
      const name = `${file.replace(/\.md$/, '')}-${i}.${lang === 'tsx' ? 'tsx' : 'ts'}`;
      await writeFile(join(outDir, name), body, 'utf8');
      index.push({ file, name });
      count++;
      i++;
    }
  }

  if (count === 0) {
    console.error(
      'check-docs-samples: no ```ts typecheck / ```tsx typecheck fences found in docs/',
    );
    process.exit(1);
  }

  await writeFile(
    join(outDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          isolatedModules: true,
          exactOptionalPropertyTypes: false,
          paths: {
            'next-tongue': ['../packages/next-tongue/src/index.ts'],
            'next-tongue/server': ['../packages/next-tongue/src/server/index.ts'],
            'next-tongue/client': ['../packages/next-tongue/src/client/index.tsx'],
            'next-tongue/navigation': [
              '../packages/next-tongue/src/navigation/index.tsx',
            ],
            'next-tongue/proxy': ['../packages/next-tongue/src/proxy/index.ts'],
            'next-tongue/config': ['../packages/next-tongue/src/config/index.ts'],
            'next/link': [
              '../packages/next-tongue/src/vendor-shims/next.d.ts',
            ],
            'next/navigation': [
              '../packages/next-tongue/src/vendor-shims/next.d.ts',
            ],
          },
        },
        include: ['./**/*.ts', './**/*.tsx', './**/*.d.ts'],
        files: [
          '../packages/next-tongue/src/vendor-shims/next.d.ts',
        ],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`check-docs-samples: extracted ${count} sample(s)`);
  for (const row of index) console.log(`  - ${row.file} → ${row.name}`);

  const tsc = spawnSync(
    'pnpm',
    ['exec', 'tsc', '-p', outDir, '--pretty', 'false'],
    { cwd: root, encoding: 'utf8' },
  );
  if (tsc.stdout) process.stdout.write(tsc.stdout);
  if (tsc.stderr) process.stderr.write(tsc.stderr);
  if (tsc.status !== 0) {
    console.error('check-docs-samples: tsc failed');
    process.exit(tsc.status ?? 1);
  }
  console.log('check-docs-samples: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
