import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

export type MigrateCliOptions = {
  cwd?: string;
  from?: string;
  dryRun?: boolean;
  quiet?: boolean;
};

type Edit = {
  file: string;
  description: string;
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
 * Partial next-intl → next-tongue codemod (#31).
 * Client `useTranslations` → `useT` is rewritten; server `getTranslations`
 * gets `TODO(tongue)` comments when locale cannot be inferred.
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
  const edits: Edit[] = [];
  let changedFiles = 0;

  for (const file of files) {
    const before = await readFile(file, 'utf8');
    if (!before.includes('next-intl') && !/\buseTranslations\b|\bgetTranslations\b/.test(before)) {
      continue;
    }
    const { text, notes } = transformNextIntl(before, relative(cwd, file));
    if (text !== before) {
      changedFiles++;
      if (!opts.dryRun) {
        await writeFile(file, text, 'utf8');
      }
      for (const n of notes) {
        edits.push({ file: relative(cwd, file), description: n });
      }
      if (notes.length === 0) {
        edits.push({
          file: relative(cwd, file),
          description: 'rewrote next-intl imports / useTranslations',
        });
      }
    } else if (notes.length) {
      for (const n of notes) {
        edits.push({ file: relative(cwd, file), description: n });
      }
    }
  }

  if (!opts.quiet) {
    const mode = opts.dryRun ? 'dry-run' : 'wrote';
    console.log(
      `tongue migrate next-intl: ${mode} ${changedFiles} file(s), ${edits.length} note(s)`,
    );
    for (const e of edits.slice(0, 50)) {
      console.log(`  ${e.file}: ${e.description}`);
    }
    if (edits.length > 50) console.log(`  … +${edits.length - 50} more`);
    console.log(
      'Server getTranslations still needs locale from params — see docs/migration/next-intl.md',
    );
  }
}

export function transformNextIntl(
  source: string,
  _file: string,
): { text: string; notes: string[] } {
  const notes: string[] = [];
  let text = source;

  // Imports from next-intl → next-tongue surfaces
  text = text.replace(
    /from\s+['"]next-intl\/server['"]/g,
    (m) => {
      notes.push('import next-intl/server → next-tongue/server (review getT locale args)');
      return m.replace('next-intl/server', 'next-tongue/server');
    },
  );
  text = text.replace(
    /from\s+['"]next-intl\/client['"]/g,
    () => {
      notes.push('import next-intl/client → next-tongue/client');
      return `from 'next-tongue/client'`;
    },
  );
  text = text.replace(
    /from\s+['"]next-intl\/navigation['"]/g,
    () => {
      notes.push('import next-intl/navigation → next-tongue/navigation');
      return `from 'next-tongue/navigation'`;
    },
  );
  text = text.replace(
    /from\s+['"]next-intl['"]/g,
    () => {
      notes.push("import 'next-intl' → 'next-tongue/client' (verify exports)");
      return `from 'next-tongue/client'`;
    },
  );

  // useTranslations('ns') → useT('ns')
  if (/\buseTranslations\b/.test(text)) {
    text = text.replace(/\buseTranslations\b/g, 'useT');
    notes.push('useTranslations → useT');
  }

  // useFormatter → useFormat
  if (/\buseFormatter\b/.test(text)) {
    text = text.replace(/\buseFormatter\b/g, 'useFormat');
    notes.push('useFormatter → useFormat');
  }

  // getFormatter → getFormat (still needs locale)
  if (/\bgetFormatter\b/.test(text)) {
    text = text.replace(/\bgetFormatter\b/g, 'getFormat');
    notes.push('getFormatter → getFormat (pass locale)');
  }

  // NextIntlClientProvider → TongueProvider
  if (/\bNextIntlClientProvider\b/.test(text)) {
    text = text.replace(/\bNextIntlClientProvider\b/g, 'TongueProvider');
    notes.push('NextIntlClientProvider → TongueProvider (pass locale=, drop messages=)');
  }

  // getTranslations — annotate; rewrite only when locale is already explicit
  text = text.replace(
    /await\s+getTranslations\(\s*\{\s*locale\s*,\s*namespace\s*:\s*(['"])([^'"]+)\1\s*\}\s*\)/g,
    (_m, q: string, ns: string) => {
      notes.push(`getTranslations({ locale, namespace }) → getT(locale, ${q}${ns}${q})`);
      return `await getT(locale, ${q}${ns}${q})`;
    },
  );
  text = text.replace(
    /await\s+getTranslations\(\s*(['"])([^'"]+)\1\s*\)/g,
    (m, q: string, ns: string) => {
      notes.push(
        `getTranslations(${q}${ns}${q}) needs locale — left as TODO(tongue)`,
      );
      return `/* TODO(tongue): pass locale from params */ await getT(/* locale */, ${q}${ns}${q}) /* was: ${m} */`;
    },
  );
  if (/\bgetTranslations\b/.test(text) && !notes.some((n) => n.includes('getTranslations'))) {
    notes.push('remaining getTranslations() — add locale manually');
  }

  // setRequestLocale — remove call lines (best-effort)
  if (/\bsetRequestLocale\b/.test(text)) {
    text = text.replace(/^[ \t]*setRequestLocale\([^)]*\);\s*\n/gm, '');
    notes.push('removed setRequestLocale() calls');
  }

  return { text, notes };
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
