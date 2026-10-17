import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export type ReferencedKey = {
  fullKey: string;
  namespace: string;
  key: string;
  file: string;
  line: number;
};

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mdx']);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.tongue',
  'dist',
  'out',
  '.next',
  'coverage',
]);

/**
 * Find `t('key')` / `t.rich('key')` under a known `useT`/`getT` namespace,
 * plus bare `useT('ns')` / `getT('ns')` for namespace awareness.
 */
export async function scanReferencedKeys(
  cwd: string,
  roots: string[] = ['app', 'src', 'components'],
): Promise<ReferencedKey[]> {
  const files: string[] = [];
  for (const root of roots) {
    const abs = join(cwd, root);
    try {
      if (!(await stat(abs)).isDirectory()) continue;
    } catch {
      continue;
    }
    await walk(abs, files);
  }

  const out: ReferencedKey[] = [];
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const rel = relative(cwd, file);
    out.push(...extractFromSource(src, rel));
  }
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.') continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      await walk(abs, out);
    } else if (SOURCE_EXT.has(extname(ent.name))) {
      out.push(abs);
    }
  }
}

function extname(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i);
}

export function extractFromSource(
  source: string,
  file: string,
): ReferencedKey[] {
  const out: ReferencedKey[] = [];
  const translators = new Map<string, string>(); // var → ns

  // useT('ns') | getT('ns') | getT(locale, 'ns')
  const declRe =
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useT|getT)\s*\(\s*(?:[^'"\n,]+,\s*)?(['"])([^'"]*)\2\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source)) !== null) {
    translators.set(m[1]!, m[3] || '_root');
  }

  for (const [varName, ns] of translators) {
    const callRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(['"])([^'"]+)\\1`,
      'g',
    );
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(source)) !== null) {
      const key = cm[2]!;
      const fullKey = ns === '_root' || ns === '' ? key : `${ns}.${key}`;
      const line = lineAt(source, cm.index);
      out.push({
        fullKey,
        namespace: ns || '_root',
        key,
        file,
        line,
      });
    }
  }

  return out;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
