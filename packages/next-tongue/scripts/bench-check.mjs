#!/usr/bin/env node
/**
 * Gate: tongue check on ~10k keys / 500 source files completes in < 5 s (#v0.3).
 */
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = 10_000;
const FILES = 500;
const LIMIT_MS = 5_000;

const dir = await mkdtemp(join(tmpdir(), 'tongue-check-bench-'));
try {
  await mkdir(join(dir, 'messages'), { recursive: true });
  await mkdir(join(dir, 'app'), { recursive: true });

  const en = { home: {} };
  const de = { home: {} };
  for (let i = 0; i < KEYS; i++) {
    en.home[`k${i}`] = `Message ${i}`;
    de.home[`k${i}`] = `Nachricht ${i}`;
  }
  await writeFile(join(dir, 'messages/en.json'), JSON.stringify(en));
  await writeFile(join(dir, 'messages/de.json'), JSON.stringify(de));
  await writeFile(
    join(dir, 'tongue.config.mjs'),
    `export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  strict: { unused: 'off' },
};\n`,
  );

  // 500 files each referencing a distinct key (covers scanner cost).
  const perFile = Math.ceil(KEYS / FILES);
  for (let f = 0; f < FILES; f++) {
    const lines = [
      `const t = await getT(locale, 'home');`,
      `export default function Page${f}() {`,
      `  return (`,
      `    <>`,
    ];
    for (let i = 0; i < perFile; i++) {
      const key = f * perFile + i;
      if (key >= KEYS) break;
      lines.push(`      <span>{t('k${key}')}</span>`);
    }
    lines.push(`    </>`, `  );`, `}`, ``);
    await writeFile(join(dir, `app/page-${f}.tsx`), lines.join('\n'));
  }

  const bin = join(root, 'bin/tongue.js');
  const t0 = performance.now();
  const result = spawnSync(
    process.execPath,
    [bin, 'check', '--cwd', dir, '--quiet', '--reporter', 'json'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const ms = performance.now() - t0;

  if (result.status !== 0 && result.status !== 1) {
    console.error(result.stderr || result.stdout);
    console.error(`tongue check exited ${result.status}`);
    process.exit(1);
  }

  console.log(
    `tongue check bench: ${KEYS} keys, ${FILES} files → ${ms.toFixed(0)} ms (limit ${LIMIT_MS} ms)`,
  );
  if (ms > LIMIT_MS) {
    console.error('tongue check bench: exceeded 5 s budget');
    process.exit(1);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
