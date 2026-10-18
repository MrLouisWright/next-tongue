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
    const proxy = await readFile(join(dir, 'proxy.ts'), 'utf8');
    expect(proxy).toContain("createProxy({");
    expect(proxy).toContain("locales: [\"en\",\"de\"]");
    expect(proxy).toContain("defaultLocale: \"en\"");

    const layout = await readFile(join(dir, 'app/[locale]/layout.tsx'), 'utf8');
    expect(layout).toContain('export const generateStaticParams = localeParams');
    expect(layout).toContain('TongueProvider');
    expect(layout).toContain('<html lang={locale}');

    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      imports: Record<string, string>;
    };
    expect(pkg.imports['#tongue/*']).toBe('./.tongue/*');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.json'), 'utf8')) as {
      include: string[];
      compilerOptions: { paths: Record<string, string[]> };
    };
    expect(ts.include).toContain('.tongue/types.d.ts');
    expect(ts.compilerOptions.paths['#tongue/*']).toEqual(['./.tongue/*']);

    // Second run without --force skips creates
    await cmdInit({ cwd: dir, yes: true, quiet: true });
    const layout2 = await readFile(join(dir, 'app/[locale]/layout.tsx'), 'utf8');
    expect(layout2).toBe(layout);
  });

  it('uses src/app and src/proxy.ts when src/ exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-src-'));
    await mkdir(join(dir, 'src', 'app'), { recursive: true });
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', private: true }, null, 2),
    );

    await cmdInit({ cwd: dir, yes: true, quiet: true });

    await access(join(dir, 'src/proxy.ts'));
    await access(join(dir, 'src/app/[locale]/layout.tsx'));
    await expect(access(join(dir, 'proxy.ts'))).rejects.toThrow();
  });

  it('omits <html> under [locale] when a root layout already exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-root-'));
    await mkdir(join(dir, 'src', 'app'), { recursive: true });
    await writeFile(
      join(dir, 'src/app/layout.tsx'),
      `export default function Root({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}\n`,
    );
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', private: true }, null, 2),
    );

    await cmdInit({ cwd: dir, yes: true, quiet: true });

    const layout = await readFile(
      join(dir, 'src/app/[locale]/layout.tsx'),
      'utf8',
    );
    expect(layout).not.toContain('<html');
    expect(layout).toContain('TongueProvider');
  });

  it('skips writing proxy when one already exists (default)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-proxy-'));
    await writeFile(join(dir, 'proxy.ts'), '// existing\n');
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', private: true }, null, 2),
    );

    await cmdInit({ cwd: dir, yes: true, quiet: true });

    const proxy = await readFile(join(dir, 'proxy.ts'), 'utf8');
    expect(proxy).toBe('// existing\n');
  });

  it('--proxy merge wires createProxy into an existing handler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-merge-'));
    await writeFile(
      join(dir, 'proxy.ts'),
      `import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  return NextResponse.next();
}
`,
    );
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', private: true }, null, 2),
    );

    await cmdInit({
      cwd: dir,
      yes: true,
      quiet: true,
      proxyMode: 'merge',
      locales: 'en,de',
      default: 'en',
    });

    const proxy = await readFile(join(dir, 'proxy.ts'), 'utf8');
    expect(proxy).toContain("from 'next-tongue/proxy'");
    expect(proxy).toContain('const tongue = createProxy({');
    expect(proxy).toContain('locales: ["en","de"]');
    expect(proxy).toContain('return tongue(req)');
    expect(proxy).toMatch(/startsWith\('\/api'\)[\s\S]*return NextResponse\.next\(\)/);
  });

  it('--proxy overwrite replaces an existing proxy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-ow-'));
    await writeFile(join(dir, 'proxy.ts'), '// existing\n');
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', private: true }, null, 2),
    );

    await cmdInit({
      cwd: dir,
      yes: true,
      quiet: true,
      proxyMode: 'overwrite',
    });

    const proxy = await readFile(join(dir, 'proxy.ts'), 'utf8');
    expect(proxy).toContain('createProxy({');
    expect(proxy).not.toContain('// existing');
  });

  it('--dry-run writes nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-init-dry-'));
    await mkdir(dir, { recursive: true });
    await cmdInit({ cwd: dir, yes: true, dryRun: true, quiet: true });
    await expect(access(join(dir, 'tongue.config.ts'))).rejects.toThrow();
  });
});
