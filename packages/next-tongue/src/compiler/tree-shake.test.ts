import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { resolveConfig } from '../config/validate.js';
import { buildMessages } from './build.js';

describe('per-key tree-shaking', () => {
  it('unused keys are dropped by esbuild when only some keys are imported', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-shake-'));
    await mkdir(join(dir, 'messages'));
    const keys: Record<string, string> = {};
    for (let i = 0; i < 20; i++) keys[`k${i}`] = `Message ${i}`;
    await writeFile(
      join(dir, 'messages', 'en.json'),
      JSON.stringify({ ns: keys }),
    );
    await writeFile(
      join(dir, 'messages', 'de.json'),
      JSON.stringify({
        ns: Object.fromEntries(
          Object.keys(keys).map((k) => [k, `Nachricht ${k.slice(1)}`]),
        ),
      }),
    );

    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    await buildMessages({ config, cwd: dir });

    const entry = join(dir, 'entry.js');
    await writeFile(
      entry,
      `import { k0 } from './.tongue/msg/ns/k0.js';\nimport { k1 } from './.tongue/msg/ns/k1.js';\nexport const out = (l) => k0(l) + k1(l);\n`,
    );

    const outfile = join(dir, 'out.js');
    await esbuild({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      outfile,
      treeShaking: true,
    });

    const code = await readFile(outfile, 'utf8');
    expect(code).toContain('Message 0');
    expect(code).toContain('Message 1');
    // Unused key text must not appear
    expect(code).not.toContain('Message 19');
    expect(code).not.toContain('Nachricht 19');
  });
});
