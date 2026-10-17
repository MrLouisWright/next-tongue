import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export type ReferencedKey = {
  fullKey: string;
  namespace: string;
  key: string;
  file: string;
  line: number;
};

export type ScanResult = {
  refs: ReferencedKey[];
  /**
   * Namespaces where `t(variable)` / `t.ns(...)` was seen — unused-key warnings
   * for these namespaces are suppressed (dynamic / whole-ns usage).
   */
  dynamicNamespaces: Set<string>;
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
 * plus `t.dynamic(..., { from })` declared keys and dynamic `t(var)` markers.
 */
export async function scanReferencedKeys(
  cwd: string,
  roots: string[] = ['app', 'src', 'components'],
): Promise<ReferencedKey[]> {
  return (await scanKeys(cwd, roots)).refs;
}

export async function scanKeys(
  cwd: string,
  roots: string[] = ['app', 'src', 'components'],
): Promise<ScanResult> {
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

  const refs: ReferencedKey[] = [];
  const dynamicNamespaces = new Set<string>();
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const rel = relative(cwd, file);
    const part = extractFromSource(src, rel);
    refs.push(...part.refs);
    for (const ns of part.dynamicNamespaces) dynamicNamespaces.add(ns);
  }
  return { refs, dynamicNamespaces };
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
): ScanResult {
  const out: ReferencedKey[] = [];
  const dynamicNamespaces = new Set<string>();
  const translators = new Map<string, string>(); // var → ns

  // useT('ns') | getT('ns') | getT(locale, 'ns')
  const declRe =
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useT|getT)\s*\(\s*(?:[^'"\n,]+,\s*)?(['"])([^'"]*)\2\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source)) !== null) {
    translators.set(m[1]!, m[3] || '_root');
  }

  const push = (ns: string, key: string, index: number) => {
    const fullKey = ns === '_root' || ns === '' ? key : `${ns}.${key}`;
    out.push({
      fullKey,
      namespace: ns || '_root',
      key,
      file,
      line: lineAt(source, index),
    });
  };

  for (const [varName, ns] of translators) {
    // Literal t('key') / t.rich('key')
    const callRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(['"])([^'"]+)\\1`,
      'g',
    );
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(source)) !== null) {
      push(ns, cm[2]!, cm.index);
    }

    // t.dynamic(any, { from: ['a', 'b'] })
    const dynRe = new RegExp(
      `\\b${escapeRegExp(varName)}\\.dynamic\\s*\\(`,
      'g',
    );
    let dm: RegExpExecArray | null;
    while ((dm = dynRe.exec(source)) !== null) {
      const tail = source.slice(dm.index, dm.index + 400);
      const fromMatch = /from\s*:\s*\[([^\]]*)\]/.exec(tail);
      if (fromMatch) {
        const keys = fromMatch[1]!.match(/['"]([^'"]+)['"]/g) ?? [];
        for (const raw of keys) {
          const key = raw.slice(1, -1);
          push(ns, key, dm.index);
        }
      }
      dynamicNamespaces.add(ns || '_root');
    }

    // t.ns('other') — whole namespace marked dynamic
    const nsRe = new RegExp(
      `\\b${escapeRegExp(varName)}\\.ns\\s*\\(\\s*(['"])([^'"]+)\\1`,
      'g',
    );
    let nm: RegExpExecArray | null;
    while ((nm = nsRe.exec(source)) !== null) {
      dynamicNamespaces.add(nm[2] || '_root');
    }

    // Non-literal t(var) / t.rich(var) — mark namespace dynamic + harvest nearby string arrays
    const nonLitRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(?!['"])([A-Za-z_$][\\w$]*)`,
      'g',
    );
    let nl: RegExpExecArray | null;
    let sawNonLit = false;
    while ((nl = nonLitRe.exec(source)) !== null) {
      sawNonLit = true;
      dynamicNamespaces.add(ns || '_root');
    }
    if (sawNonLit) {
      // Keys listed in string arrays in this file (e.g. KEYS.map((k) => t(k)))
      const arrayLitRe = /\[\s*((?:['"][^'"]+['"]\s*,?\s*)+)\]/g;
      let am: RegExpExecArray | null;
      while ((am = arrayLitRe.exec(source)) !== null) {
        const keys = am[1]!.match(/['"]([^'"]+)['"]/g) ?? [];
        for (const raw of keys) {
          push(ns, raw.slice(1, -1), am.index);
        }
      }
    }
  }

  return { refs: out, dynamicNamespaces };
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
