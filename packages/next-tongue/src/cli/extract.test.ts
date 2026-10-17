import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdExtract } from './extract.js';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-extract-'));
  await mkdir(join(dir, 'messages'));
  await mkdir(join(dir, 'app'), { recursive: true });
  await writeFile(
    join(dir, 'messages/en.json'),
    JSON.stringify({ home: { title: 'Hello', orphan: 'Unused' } }, null, 2),
  );
  await writeFile(
    join(dir, 'messages/de.json'),
    JSON.stringify({ home: { title: 'Hallo', orphan: 'Ungenutzt' } }, null, 2),
  );
  await writeFile(
    join(dir, 'tongue.config.mjs'),
    `export default { locales: ['en', 'de'], defaultLocale: 'en', messages: './messages/{locale}.json' };\n`,
  );
  await writeFile(
    join(dir, 'app/page.tsx'),
    `const t = await getT(locale, 'home');\nexport default () => t('title') + t('inbox');\n`,
  );
  return dir;
}

describe('cmdExtract', () => {
  it('adds missing keys and can prune unused with --yes', async () => {
    const dir = await fixture();
    await cmdExtract({
      cwd: dir,
      prune: true,
      yes: true,
      quiet: true,
    });
    const en = JSON.parse(await readFile(join(dir, 'messages/en.json'), 'utf8')) as {
      home: Record<string, string>;
    };
    expect(en.home.title).toBe('Hello');
    expect(en.home.inbox).toBe('home.inbox');
    expect(en.home.orphan).toBeUndefined();
  });

  it('--dry-run does not write', async () => {
    const dir = await fixture();
    const before = await readFile(join(dir, 'messages/en.json'), 'utf8');
    await cmdExtract({ cwd: dir, dryRun: true, quiet: true });
    const after = await readFile(join(dir, 'messages/en.json'), 'utf8');
    expect(after).toBe(before);
  });
});
