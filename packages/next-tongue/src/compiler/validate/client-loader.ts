import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CheckIssue } from '../../cli/check-types.js';
import { transformCallSites } from '../../next/loader.js';
import { DEFAULT_SCAN_ROOTS } from '../scan-keys.js';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Dry-run the call-site loader on `"use client"` files that call `useT`.
 * Fails when rewritten output calls `useLocale` without importing it
 * (Safari: Can't find variable: useLocale).
 */
export async function validateClientLoader(
  cwd: string,
  roots: readonly string[] = DEFAULT_SCAN_ROOTS,
): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const files = await collectSourceFiles(cwd, roots);

  for (const abs of files) {
    let src: string;
    try {
      src = await readFile(abs, 'utf8');
    } catch {
      continue;
    }
    if (!/"use client"\s*;?/.test(src) && !/'use client'\s*;?/.test(src)) {
      continue;
    }
    if (!/\buseT\s*\(/.test(src)) continue;

    const rel = relative(cwd, abs);
    const { code } = transformCallSites(src, rel);
    if (!/\buseLocale\s*\(/.test(code)) continue;

    const hasImport =
      /import\s*\{[^}]*\buseLocale\b[^}]*\}\s*from\s*['"]next-tongue\/client['"]/.test(
        code,
      );
    if (!hasImport) {
      issues.push({
        check: 'client-loader',
        severity: 'error',
        message: `Rewritten useT in "${rel}" calls useLocale() without importing it from 'next-tongue/client' (Safari ReferenceError). Upgrade next-tongue / ensure withTongue() applies the call-site loader.`,
        file: rel,
      });
    }
  }

  return issues;
}

async function collectSourceFiles(
  cwd: string,
  roots: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) {
    const abs = join(cwd, root);
    try {
      if (!(await stat(abs)).isDirectory()) continue;
    } catch {
      continue;
    }
    await walk(abs, out);
  }
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (
        ent.name === 'node_modules' ||
        ent.name === '.next' ||
        ent.name === 'dist'
      ) {
        continue;
      }
      await walk(abs, out);
    } else {
      const i = ent.name.lastIndexOf('.');
      const ext = i === -1 ? '' : ent.name.slice(i);
      if (SOURCE_EXT.has(ext)) out.push(abs);
    }
  }
}
