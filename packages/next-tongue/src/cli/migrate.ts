import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

export type MigrateCliOptions = {
  cwd?: string;
  from?: string;
  dryRun?: boolean;
  quiet?: boolean;
  json?: boolean;
  report?: string;
};

export type MigrateNote = {
  file: string;
  description: string;
  kind: 'rewrite' | 'todo' | 'info';
};

export type MigrateReport = {
  from: string;
  dryRun: boolean;
  changedFiles: number;
  notes: MigrateNote[];
  todos: number;
};

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.tongue',
  'dist',
  'out',
  'coverage',
]);

/**
 * next-intl → next-tongue codemod (#31).
 * Client `useTranslations` → `useT`; server `getTranslations` uses `locale`
 * when in scope, otherwise `TODO(tongue)`.
 */
export async function cmdMigrate(opts: MigrateCliOptions): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const from = opts.from ?? 'next-intl';
  if (from !== 'next-intl') {
    console.error(`Unknown migrate source: ${from} (only next-intl is supported)`);
    process.exitCode = 2;
    return;
  }

  const files = await walkSource(cwd);
  const notes: MigrateNote[] = [];
  let changedFiles = 0;

  for (const file of files) {
    const before = await readFile(file, 'utf8');
    if (
      !before.includes('next-intl') &&
      !/\buseTranslations\b|\bgetTranslations\b|\bsetRequestLocale\b|\bNextIntlClientProvider\b/.test(
        before,
      )
    ) {
      continue;
    }
    const rel = relative(cwd, file);
    const { text, notes: fileNotes } = transformNextIntl(before, rel);
    if (text !== before) {
      changedFiles++;
      if (!opts.dryRun) {
        await writeFile(file, text, 'utf8');
      }
    }
    for (const n of fileNotes) {
      notes.push({ file: rel, ...n });
    }
  }

  const report: MigrateReport = {
    from,
    dryRun: opts.dryRun === true,
    changedFiles,
    notes,
    todos: notes.filter((n) => n.kind === 'todo').length,
  };

  if (opts.report) {
    const outPath = resolve(cwd, opts.report);
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    if (!opts.quiet) console.log(`tongue migrate: wrote report ${opts.report}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(report));
    return;
  }

  if (!opts.quiet) {
    const mode = opts.dryRun ? 'dry-run' : 'wrote';
    console.log(
      `tongue migrate next-intl: ${mode} ${changedFiles} file(s), ${notes.length} note(s), ${report.todos} TODO(tongue)`,
    );
    for (const e of notes.slice(0, 50)) {
      console.log(`  [${e.kind}] ${e.file}: ${e.description}`);
    }
    if (notes.length > 50) console.log(`  … +${notes.length - 50} more`);
    if (report.todos > 0) {
      console.log(
        'Search for TODO(tongue) — pass locale from params. See docs/migration/next-intl.md',
      );
    }
  }
}

export function transformNextIntl(
  source: string,
  _file: string,
): { text: string; notes: Array<{ description: string; kind: MigrateNote['kind'] }> } {
  const notes: Array<{ description: string; kind: MigrateNote['kind'] }> = [];
  let text = source;
  const localeInScope = hasLocaleInScope(source);

  const note = (description: string, kind: MigrateNote['kind'] = 'rewrite') => {
    notes.push({ description, kind });
  };

  text = text.replace(/from\s+['"]next-intl\/server['"]/g, (m) => {
    note('import next-intl/server → next-tongue/server');
    return m.replace('next-intl/server', 'next-tongue/server');
  });
  text = text.replace(/from\s+['"]next-intl\/client['"]/g, () => {
    note('import next-intl/client → next-tongue/client');
    return `from 'next-tongue/client'`;
  });
  text = text.replace(/from\s+['"]next-intl\/navigation['"]/g, () => {
    note('import next-intl/navigation → next-tongue/navigation');
    return `from 'next-tongue/navigation'`;
  });
  text = text.replace(/from\s+['"]next-intl['"]/g, () => {
    note("import 'next-intl' → 'next-tongue/client' (verify exports)", 'info');
    return `from 'next-tongue/client'`;
  });

  if (/\buseTranslations\b/.test(text)) {
    text = text.replace(/\buseTranslations\b/g, 'useT');
    note('useTranslations → useT');
  }

  if (/\buseFormatter\b/.test(text)) {
    text = text.replace(/\buseFormatter\b/g, 'useFormat');
    note('useFormatter → useFormat');
  }

  if (/\bgetFormatter\b/.test(text)) {
    text = text.replace(/\bgetFormatter\b/g, 'getFormat');
    note(
      localeInScope
        ? 'getFormatter → getFormat (pass locale)'
        : 'getFormatter → getFormat — add locale arg',
      localeInScope ? 'rewrite' : 'todo',
    );
    if (localeInScope) {
      text = text.replace(
        /await\s+getFormat\(\s*\)/g,
        'await getFormat(locale)',
      );
    }
  }

  if (/\bNextIntlClientProvider\b/.test(text)) {
    text = text.replace(/\bNextIntlClientProvider\b/g, 'TongueProvider');
    note('NextIntlClientProvider → TongueProvider (pass locale=, drop messages=)', 'info');
  }

  text = text.replace(
    /await\s+getTranslations\(\s*\{\s*locale\s*,\s*namespace\s*:\s*(['"])([^'"]+)\1\s*\}\s*\)/g,
    (_m, q: string, ns: string) => {
      note(`getTranslations({ locale, namespace }) → getT(locale, ${q}${ns}${q})`);
      return `await getT(locale, ${q}${ns}${q})`;
    },
  );

  text = text.replace(
    /await\s+getTranslations\(\s*(['"])([^'"]+)\1\s*\)/g,
    (m, q: string, ns: string) => {
      if (localeInScope) {
        note(`getTranslations(${q}${ns}${q}) → getT(locale, ${q}${ns}${q}) (locale in scope)`);
        return `await getT(locale, ${q}${ns}${q})`;
      }
      note(`getTranslations(${q}${ns}${q}) needs locale — TODO(tongue)`, 'todo');
      return `/* TODO(tongue): pass locale from params */ await getT(/* locale */, ${q}${ns}${q}) /* was: ${m} */`;
    },
  );

  if (/\bgetTranslations\b/.test(text)) {
    note('remaining getTranslations() — review manually', 'todo');
  }

  if (/\bsetRequestLocale\b/.test(text)) {
    text = text.replace(/^[ \t]*setRequestLocale\([^)]*\);\s*\n/gm, '');
    note('removed setRequestLocale() calls');
  }

  // createNextIntlPlugin → withTongue (next.config)
  if (/\bcreateNextIntlPlugin\b/.test(text)) {
    text = text.replace(/\bcreateNextIntlPlugin\b/g, 'withTongue');
    text = text.replace(
      /from\s+['"]next-intl\/plugin['"]/g,
      `from 'next-tongue/next'`,
    );
    note('createNextIntlPlugin → withTongue (from next-tongue/next)', 'info');
  }

  return { text, notes };
}

/** Heuristic: `locale` is a binding from params, props, or a nearby const. */
export function hasLocaleInScope(source: string): boolean {
  if (/\b(?:const|let|var)\s+locale\b/.test(source)) return true;
  if (/\{\s*locale\s*[,}]/.test(source)) return true;
  if (/\bparams\s*:\s*Promise\s*<\s*\{[^}]*locale/.test(source)) return true;
  if (/\bfunction\s+\w+\s*\([^)]*\blocale\b/.test(source)) return true;
  if (/\(\s*\{\s*[^}]*\blocale\b[^}]*\}\s*[=:]/.test(source)) return true;
  return false;
}

async function walkSource(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
    }
  }
  await walk(dir);
  return out;
}
