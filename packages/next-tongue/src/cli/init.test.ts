import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdInit } from './init.js';

describe('cmdInit', () => {
  it('scaffolds files with --yes and is idempotent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', private: true }, null, 2),
    );
    await writeFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ include: ['**/*.ts'] }, null, 2),
    );

    await cmdInit({
      cwd: dir,
      yes: true,
      locales: 'en,de',
      default: 'en',
      quiet: true,
    });

    await access(join(dir, 'tongue.config.ts'));
    await access(join(dir, 'messages/en.json'));
    await access(join(dir, 'proxy.ts'));
    const layout = await readFile(join(dir, 'app/[locale]/layout.tsx'), 'utf8');
    expect(layout).toContain('export const generateStaticParams = localeParams');
    expect(layout).toContain('TongueProvider');

    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      imports: Record<string, string>;
    };
    expect(pkg.imports['#tongue/*']).toBe('./.tongue/*');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.json'), 'utf8')) as {
      include: string[];
    };
    expect(ts.include).toContain('.tongue/types.d.ts');

    // Second run without --force skips creates
    await cmdInit({ cwd: dir, yes: true, quiet: true });
    const layout2 = await readFile(join(dir, 'app/[locale]/layout.tsx'), 'utf8');
    expect(layout2).toBe(layout);
  });

  it('--dry-run writes nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-dry-'));
    await mkdir(dir, { recursive: true });
    await cmdInit({ cwd: dir, yes: true, dryRun: true, quiet: true });
    await expect(access(join(dir, 'tongue.config.ts'))).rejects.toThrow();
  });
});
