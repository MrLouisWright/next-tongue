import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResolvedTongueConfig, StrictLevel } from '../../config/types.js';
import type { CheckIssue, CheckSeverity } from '../../cli/check-types.js';
import { getDir } from '../../runtime/locale.js';

function severityFor(level: StrictLevel): CheckSeverity | null {
  if (level === 'off') return null;
  return level === 'error' ? 'error' : 'warn';
}

/**
 * Static analysis: some layout in the tree should set `<html lang={locale}>`
 * and `dir={getDir(locale)}` for RTL.
 *
 * Next.js only allows `<html>` on the **root** layout. When `app/layout` (or
 * `src/app/layout`) exists beside `app/[locale]`, check the root layout for
 * lang/dir (or any client sync of `document.documentElement.lang`). Otherwise
 * check the `[locale]` layout (greenfield pattern).
 */
export async function validateA11y(
  config: ResolvedTongueConfig,
  cwd: string,
): Promise<CheckIssue[]> {
  const sev = severityFor(config.strict.a11y);
  if (!sev) return [];

  const localeLayouts = await findLocaleLayouts(cwd);
  if (localeLayouts.length === 0) {
    return [
      {
        check: 'a11y',
        severity: sev,
        message:
          'No app/[locale]/layout.* (or src/app/[locale]/layout.*) found — cannot verify lang/dir',
      },
    ];
  }

  const rootLayouts = await findRootLayouts(cwd);
  const checkFiles =
    rootLayouts.length > 0
      ? [...rootLayouts, ...localeLayouts]
      : localeLayouts;

  const rtlLocales = config.locales.filter((l) => getDir(l) === 'rtl');
  let anyLang = false;
  let anyDir = false;
  const sources: string[] = [];

  for (const file of checkFiles) {
    const src = await readFile(file, 'utf8');
    sources.push(src);
    if (hasLangHint(src)) anyLang = true;
    if (hasDirHint(src)) anyDir = true;
  }

  const issues: CheckIssue[] = [];
  const rel =
    (rootLayouts[0] ?? localeLayouts[0] ?? '').replace(cwd + '/', '').replace(cwd + '\\', '') ||
    'layout';

  if (!anyLang) {
    issues.push({
      check: 'a11y',
      severity: sev,
      message: rootLayouts.length
        ? 'Set <html lang={locale}> on the root layout (Next disallows <html> under [locale]), or sync document.documentElement.lang from the locale'
        : 'Root locale layout <html> is missing lang={locale} (or lang=…)',
      file: rel,
    });
  }
  if (rtlLocales.length > 0 && !anyDir) {
    issues.push({
      check: 'a11y',
      severity: sev,
      message: rootLayouts.length
        ? `Set <html dir={…}> on the root layout for RTL locales (${rtlLocales.join(', ')}), or sync document.documentElement.dir`
        : `Root locale layout <html> is missing dir={getDir(locale)} (RTL locales: ${rtlLocales.join(', ')})`,
      file: rel,
    });
  }

  return issues;
}

function hasLangHint(src: string): boolean {
  return (
    /<html[^>]*\blang=\{/.test(src) ||
    /<html[^>]*\blang=["']/.test(src) ||
    /\blang=\{locale\}/.test(src) ||
    /document\.documentElement\.lang/.test(src) ||
    /setAttribute\(\s*['"]lang['"]/.test(src) ||
    /\bHtmlLang\b/.test(src) ||
    /\.lang\s*=/.test(src)
  );
}

function hasDirHint(src: string): boolean {
  return (
    /<html[^>]*\bdir=\{/.test(src) ||
    /<html[^>]*\bdir=["']/.test(src) ||
    /\bdir=\{getDir\(/.test(src) ||
    /\bdir=\{.*getDir/.test(src) ||
    /document\.documentElement\.dir/.test(src) ||
    /setAttribute\(\s*['"]dir['"]/.test(src) ||
    /\bHtmlLang\b/.test(src)
  );
}

async function findLocaleLayouts(cwd: string): Promise<string[]> {
  return findLayoutsUnder(cwd, ['app/[locale]', 'src/app/[locale]']);
}

/** Root layouts that are siblings of [locale], not under it. */
async function findRootLayouts(cwd: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of ['app', 'src/app']) {
    const abs = join(cwd, dir);
    try {
      if (!(await stat(abs)).isDirectory()) continue;
    } catch {
      continue;
    }
    // Only treat as "existing root" when [locale] also lives under the same app dir
    // (otherwise greenfield [locale]-as-root still owns <html>).
    const hasLocale = await existsDir(join(abs, '[locale]'));
    if (!hasLocale) continue;
    const entries = await readdir(abs);
    for (const name of entries) {
      if (/^layout\.(tsx|ts|jsx|js)$/.test(name)) {
        out.push(join(abs, name));
      }
    }
  }
  return out;
}

async function findLayoutsUnder(cwd: string, roots: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const rel of roots) {
    const root = join(cwd, ...rel.split('/'));
    try {
      if (!(await stat(root)).isDirectory()) continue;
    } catch {
      continue;
    }
    const entries = await readdir(root);
    for (const name of entries) {
      if (/^layout\.(tsx|ts|jsx|js)$/.test(name)) {
        out.push(join(root, name));
      }
    }
  }
  return out;
}

async function existsDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
