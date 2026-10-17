import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import * as readline from 'node:readline';

export type InitCliOptions = {
  cwd?: string;
  locales?: string;
  default?: string;
  prefix?: 'always' | 'as-needed' | 'never';
  export?: boolean;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
};

type PlannedFile = {
  path: string;
  content: string;
  kind: 'create' | 'merge';
};

export async function cmdInit(opts: InitCliOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const interactive = !opts.yes && process.stdin.isTTY === true;

  let locales = (opts.locales ?? 'en,de')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let defaultLocale = opts.default ?? locales[0] ?? 'en';
  let prefix: 'always' | 'as-needed' | 'never' =
    opts.export === true ? 'always' : (opts.prefix ?? 'as-needed');

  if (interactive) {
    locales = (
      await ask(`Locales (comma-separated) [${locales.join(',')}]: `, locales.join(','))
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    defaultLocale = await ask(
      `Default locale [${defaultLocale}]: `,
      defaultLocale,
    );
    if (!locales.includes(defaultLocale)) {
      locales = [defaultLocale, ...locales];
    }
    if (!opts.export) {
      const p = await ask(`Prefix always|as-needed|never [${prefix}]: `, prefix);
      if (p === 'always' || p === 'as-needed' || p === 'never') prefix = p;
    }
  }

  if (!locales.includes(defaultLocale)) {
    console.error(`default locale "${defaultLocale}" must be in locales`);
    process.exitCode = 2;
    return;
  }

  const plans: PlannedFile[] = [];

  plans.push({
    path: 'tongue.config.ts',
    kind: 'create',
    content: `import { defineConfig } from 'next-tongue/config';

export default defineConfig({
  locales: ${JSON.stringify(locales)},
  defaultLocale: ${JSON.stringify(defaultLocale)},
  messages: './messages/{locale}.json',
  routing: { prefix: ${JSON.stringify(prefix)} },${
    opts.export ? `\n  // paired with next.config output: 'export'` : ''
  }
});
`,
  });

  for (const locale of locales) {
    const sample =
      locale === defaultLocale
        ? {
            home: {
              title: 'Welcome, {name}!',
              body: 'Scaffolded by tongue init.',
            },
          }
        : {
            home: {
              title: 'Welcome, {name}!',
              body: 'Scaffolded by tongue init.',
            },
          };
    plans.push({
      path: `messages/${locale}.json`,
      kind: 'create',
      content: `${JSON.stringify(sample, null, 2)}\n`,
    });
  }

  plans.push({
    path: 'proxy.ts',
    kind: 'create',
    content: `import { createProxy } from 'next-tongue/proxy';

export const proxy = createProxy();
export const config = {
  matcher: ['/((?!api|_next|.*\\\\..*).*)'],
};
`,
  });

  plans.push({
    path: 'app/[locale]/layout.tsx',
    kind: 'create',
    content: `import { notFound } from 'next/navigation';
import { TongueProvider } from 'next-tongue/client';
import { getDir, isLocale, localeParams } from 'next-tongue/server';
import { ensureTongue } from '#tongue/runtime';

ensureTongue();
export const generateStaticParams = localeParams;

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={getDir(locale)}>
      <body>
        <TongueProvider locale={locale}>{children}</TongueProvider>
      </body>
    </html>
  );
}
`,
  });

  plans.push({
    path: 'app/[locale]/page.tsx',
    kind: 'create',
    content: `import { getT } from 'next-tongue/server';
import { ensureTongue } from '#tongue/runtime';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  ensureTongue();
  const { locale } = await params;
  const t = await getT(locale, 'home');
  return (
    <main>
      <h1>{t('title', { name: 'Ada' })}</h1>
      <p>{t('body')}</p>
    </main>
  );
}
`,
  });

  // next.config — merge or create
  const nextConfigPaths = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
  let existingNext: string | null = null;
  for (const p of nextConfigPaths) {
    if (await exists(join(cwd, p))) {
      existingNext = p;
      break;
    }
  }

  if (existingNext) {
    const abs = join(cwd, existingNext);
    const src = await readFile(abs, 'utf8');
    if (!src.includes('withTongue')) {
      const merged = wrapNextConfig(src, opts.export === true);
      plans.push({ path: existingNext, kind: 'merge', content: merged });
    }
  } else {
    plans.push({
      path: 'next.config.ts',
      kind: 'create',
      content: `import type { NextConfig } from 'next';
import { withTongue } from 'next-tongue/next';

const nextConfig: NextConfig = {${
        opts.export ? `\n  output: 'export',` : ''
      }
};

export default withTongue(nextConfig);
`,
    });
  }

  // tsconfig include
  if (await exists(join(cwd, 'tsconfig.json'))) {
    const abs = join(cwd, 'tsconfig.json');
    const raw = await readFile(abs, 'utf8');
    try {
      const ts = JSON.parse(raw) as {
        include?: string[];
        compilerOptions?: Record<string, unknown>;
      };
      const include = new Set(ts.include ?? ['**/*.ts', '**/*.tsx']);
      include.add('.tongue/types.d.ts');
      ts.include = [...include];
      const next = `${JSON.stringify(ts, null, 2)}\n`;
      if (next !== raw) {
        plans.push({ path: 'tsconfig.json', kind: 'merge', content: next });
      }
    } catch {
      /* leave tsconfig alone if not JSON */
    }
  }

  // .gitignore
  const giPath = join(cwd, '.gitignore');
  if (await exists(giPath)) {
    const raw = await readFile(giPath, 'utf8');
    if (!raw.split(/\r?\n/).some((l) => l.trim() === '.tongue/')) {
      plans.push({
        path: '.gitignore',
        kind: 'merge',
        content: raw.endsWith('\n')
          ? `${raw}.tongue/\n`
          : `${raw}\n.tongue/\n`,
      });
    }
  } else {
    plans.push({
      path: '.gitignore',
      kind: 'create',
      content: `.tongue/\n`,
    });
  }

  // package.json #tongue imports
  const pkgPath = join(cwd, 'package.json');
  if (await exists(pkgPath)) {
    const raw = await readFile(pkgPath, 'utf8');
    try {
      const pkg = JSON.parse(raw) as {
        imports?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      pkg.imports = { ...(pkg.imports ?? {}), '#tongue/*': './.tongue/*' };
      const next = `${JSON.stringify(pkg, null, 2)}\n`;
      if (next !== raw) {
        plans.push({ path: 'package.json', kind: 'merge', content: next });
      }
    } catch {
      /* ignore */
    }
  }

  const writes: PlannedFile[] = [];
  for (const plan of plans) {
    const abs = join(cwd, plan.path);
    const already = await exists(abs);
    if (already && plan.kind === 'create' && !opts.force) {
      if (!opts.quiet) {
        console.log(`tongue init: skip existing ${plan.path} (pass --force to overwrite)`);
      }
      continue;
    }
    writes.push(plan);
  }

  if (opts.dryRun) {
    for (const w of writes) {
      console.log(`tongue init: would ${w.kind} ${w.path}`);
    }
    return;
  }

  for (const w of writes) {
    const abs = join(cwd, w.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, w.content, 'utf8');
    if (!opts.quiet) {
      console.log(`tongue init: ${w.kind === 'merge' ? 'updated' : 'wrote'} ${relative(cwd, abs)}`);
    }
  }

  if (!opts.quiet) {
    console.log(
      'tongue init: done. Run `npx tongue build` (or start next) so `.tongue/` is generated.',
    );
  }
}

function wrapNextConfig(src: string, staticExport: boolean): string {
  let out = src;
  if (!/withTongue/.test(out)) {
    if (/from ['"]next-tongue\/next['"]/.test(out) === false) {
      out = `import { withTongue } from 'next-tongue/next';\n` + out;
    }
    out = out.replace(
      /export\s+default\s+([^;]+);/,
      (_m, expr: string) => `export default withTongue(${expr.trim()});`,
    );
  }
  if (staticExport && !/output:\s*['"]export['"]/.test(out)) {
    out = out.replace(
      /(const\s+\w+\s*:\s*NextConfig\s*=\s*\{)/,
      `$1\n  output: 'export',`,
    );
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function ask(prompt: string, fallback: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const v = answer.trim();
      resolve(v || fallback);
    });
  });
}
