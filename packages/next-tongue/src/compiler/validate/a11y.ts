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
 * Static analysis: `[locale]` layout should set `<html lang={locale}>` and
 * `dir={getDir(locale)}` (or equivalent) for RTL locales.
 */
export async function validateA11y(
  config: ResolvedTongueConfig,
  cwd: string,
): Promise<CheckIssue[]> {
  const sev = severityFor(config.strict.a11y);
  if (!sev) return [];

  const layouts = await findLocaleLayouts(cwd);
  if (layouts.length === 0) {
    return [
      {
        check: 'a11y',
        severity: sev,
        message:
          'No app/[locale]/layout.* found — cannot verify <html lang> / dir',
      },
    ];
  }

  const issues: CheckIssue[] = [];
  const rtlLocales = config.locales.filter((l) => getDir(l) === 'rtl');

  for (const file of layouts) {
    const src = await readFile(file, 'utf8');
    const hasLang =
      /<html[^>]*\blang=\{/.test(src) ||
      /<html[^>]*\blang=["']/.test(src) ||
      /\blang=\{locale\}/.test(src);
    const hasDir =
      /<html[^>]*\bdir=\{/.test(src) ||
      /<html[^>]*\bdir=["']/.test(src) ||
      /\bdir=\{getDir\(/.test(src) ||
      /\bdir=\{.*getDir/.test(src);

    if (!hasLang) {
      issues.push({
        check: 'a11y',
        severity: sev,
        message: 'Root locale layout <html> is missing lang={locale} (or lang=…)',
        file: file.replace(cwd + '/', '').replace(cwd + '\\', ''),
      });
    }
    if (rtlLocales.length > 0 && !hasDir) {
      issues.push({
        check: 'a11y',
        severity: sev,
        message: `Root locale layout <html> is missing dir={getDir(locale)} (RTL locales: ${rtlLocales.join(', ')})`,
        file: file.replace(cwd + '/', '').replace(cwd + '\\', ''),
      });
    }
  }

  return issues;
}

async function findLocaleLayouts(cwd: string): Promise<string[]> {
  const candidates = [
    join(cwd, 'app', '[locale]'),
    join(cwd, 'src', 'app', '[locale]'),
  ];
  const out: string[] = [];
  for (const root of candidates) {
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
