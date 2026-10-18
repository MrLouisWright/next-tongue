import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import * as readline from 'node:readline';
import {
  findExistingProxyPath,
  mergeProxySource,
  PROXY_CANDIDATES,
} from './merge-proxy.js';
import { resolveInsideProject } from './safe-path.js';

export type ProxyMode = 'merge' | 'skip' | 'overwrite';

export type InitCliOptions = {
  cwd?: string;
  locales?: string;
  default?: string;
  prefix?: 'always' | 'as-needed' | 'never';
  /** How to treat an existing proxy.ts / middleware.ts. Default: skip. */
  proxyMode?: ProxyMode;
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

  const appRoot = await detectAppRoot(cwd);
  if (!opts.quiet) {
    console.log(`tongue init: using ${appRoot}/ for App Router files`);
  }
  const hasRootLayout = await hasFile(
    cwd,
    `${appRoot}/layout.tsx`,
    `${appRoot}/layout.ts`,
    `${appRoot}/layout.jsx`,
    `${appRoot}/layout.js`,
  );
  const existingProxy = await findExistingProxyPath(cwd, (rel) =>
    exists(join(cwd, rel)),
  );
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
    const sample = {
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

  let proxyMode: ProxyMode = opts.proxyMode ?? 'skip';
  if (existingProxy && opts.proxyMode == null && interactive) {
    const answer = await ask(
      `Existing ${existingProxy} — merge|skip|overwrite [skip]: `,
      'skip',
    );
    if (answer === 'merge' || answer === 'skip' || answer === 'overwrite') {
      proxyMode = answer;
    }
  }

  const scaffold = proxyScaffold(locales, defaultLocale, prefix);
  if (!existingProxy) {
    plans.push({
      path: detectProxyWritePath(appRoot),
      kind: 'create',
      content: scaffold,
    });
  } else if (proxyMode === 'overwrite') {
    plans.push({
      path: existingProxy,
      kind: 'merge',
      content: scaffold,
    });
  } else if (proxyMode === 'merge') {
    const abs = join(cwd, existingProxy);
    const src = await readFile(abs, 'utf8');
    const merged = mergeProxySource(src, {
      locales,
      defaultLocale,
      prefix,
    });
    if (merged.status === 'merged') {
      plans.push({
        path: existingProxy,
        kind: 'merge',
        content: merged.code,
      });
      if (!opts.quiet && merged.note) {
        console.log(`tongue init: ${merged.note}`);
      }
    } else if (!opts.quiet) {
      console.log(
        `tongue init: could not merge ${existingProxy} (${merged.reason}). Compose like:\n\n` +
          scaffold +
          '\nSee docs/routing-and-proxy.md#composing-with-your-own-proxy-logic.',
      );
    }
  } else if (!opts.quiet) {
    console.log(
      `tongue init: existing ${existingProxy} — skipped (pass --proxy merge to wire createProxy, or --proxy overwrite). Compose like:\n\n` +
        scaffold +
        '\nSee docs/routing-and-proxy.md#composing-with-your-own-proxy-logic / hybrid routing.',
    );
  }

  const layoutPath = `${appRoot}/[locale]/layout.tsx`;
  plans.push({
    path: layoutPath,
    kind: 'create',
    content: hasRootLayout
      ? nestedLocaleLayout()
      : rootLocaleLayout(),
  });

  plans.push({
    path: `${appRoot}/[locale]/page.tsx`,
    kind: 'create',
    content: `import { getT } from 'next-tongue/server';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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

  // tsconfig: include + paths for #tongue/* (tsc does not resolve package.json imports)
  if (await exists(join(cwd, 'tsconfig.json'))) {
    const abs = join(cwd, 'tsconfig.json');
    const raw = await readFile(abs, 'utf8');
    try {
      const ts = JSON.parse(raw) as {
        include?: string[];
        compilerOptions?: {
          paths?: Record<string, string[]>;
          [key: string]: unknown;
        };
      };
      const include = new Set(ts.include ?? ['**/*.ts', '**/*.tsx']);
      include.add('.tongue/types.d.ts');
      ts.include = [...include];
      ts.compilerOptions = ts.compilerOptions ?? {};
      const paths = { ...(ts.compilerOptions.paths ?? {}) };
      if (!paths['#tongue/*']) {
        paths['#tongue/*'] = ['./.tongue/*'];
      }
      ts.compilerOptions.paths = paths;
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
    const abs = resolveInsideProject(cwd, w.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, w.content, 'utf8');
    if (!opts.quiet) {
      console.log(`tongue init: ${w.kind === 'merge' ? 'updated' : 'wrote'} ${relative(cwd, abs)}`);
    }
  }

  if (!opts.quiet) {
    if (hasRootLayout) {
      console.log(
        'tongue init: existing root layout detected — set <html lang={locale} dir={…}> on the root layout (or a client HtmlLang), not under [locale].',
      );
    }
    console.log(
      'tongue init: done. Run `npx tongue build` (or start next) so `.tongue/` is generated.',
    );
  }
}

function proxyScaffold(
  locales: string[],
  defaultLocale: string,
  prefix: string,
): string {
  return `import { createProxy } from 'next-tongue/proxy';

// locales/defaultLocale must match tongue.config.ts (or import from '#tongue/runtime' after \`tongue build\`).
export const proxy = createProxy({
  locales: ${JSON.stringify(locales)},
  defaultLocale: ${JSON.stringify(defaultLocale)},
  prefix: ${JSON.stringify(prefix)},
});

export const config = {
  matcher: ['/((?!api|_next|.*\\\\..*).*)'],
};
`;
}

/** Greenfield: [locale] is the root layout and owns <html>. */
function rootLocaleLayout(): string {
  return `import { notFound } from 'next/navigation';
import { TongueProvider } from 'next-tongue/client';
import { getDir, isLocale } from 'next-tongue/server';
import { localeParams } from '#tongue/runtime';

// Importing #tongue/runtime auto-runs ensureTongue() (withTongue apps).
export const generateStaticParams = localeParams;

export default async function LocaleLayout({
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
`;
}

/**
 * App already has app/layout.tsx — Next only allows <html> there.
 * [locale] layout wraps children only.
 */
function nestedLocaleLayout(): string {
  return `import { notFound } from 'next/navigation';
import { TongueProvider } from 'next-tongue/client';
import { isLocale } from 'next-tongue/server';
import { localeParams } from '#tongue/runtime';

// Importing #tongue/runtime auto-runs ensureTongue() (withTongue apps).
export const generateStaticParams = localeParams;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Keep html lang/dir on the root layout (or sync via a client helper).
  return <TongueProvider locale={locale}>{children}</TongueProvider>;
}
`;
}

/** Prefer src/app when present; otherwise app/. */
export async function detectAppRoot(cwd: string): Promise<'app' | 'src/app'> {
  if (await exists(join(cwd, 'src', 'app'))) return 'src/app';
  if (await exists(join(cwd, 'app'))) return 'app';
  if (await exists(join(cwd, 'src'))) return 'src/app';
  return 'app';
}

/** Where to write a new proxy.ts when none exists. */
export function detectProxyWritePath(appRoot: 'app' | 'src/app'): string {
  return appRoot.startsWith('src/') ? 'src/proxy.ts' : 'proxy.ts';
}

/**
 * Where to write proxy.ts. Returns null when the project already has proxy/middleware
 * (caller should compose or pass `--proxy merge|overwrite`).
 */
export async function detectProxyPath(
  cwd: string,
  appRoot: 'app' | 'src/app',
): Promise<string | null> {
  for (const p of PROXY_CANDIDATES) {
    if (await exists(join(cwd, p))) return null;
  }
  return detectProxyWritePath(appRoot);
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

async function hasFile(cwd: string, ...rels: string[]): Promise<boolean> {
  for (const rel of rels) {
    if (await exists(join(cwd, rel))) return true;
  }
  return false;
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
