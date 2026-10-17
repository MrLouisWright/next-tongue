import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { findDynamicCalls } from './dynamic-from.js';

export type ReferencedKey = {
  fullKey: string;
  namespace: string;
  key: string;
  file: string;
  line: number;
};

export type UndeclaredDynamic = {
  file: string;
  line: number;
  /** Translator binding, e.g. `t` */
  name: string;
  namespace: string;
};

export type ScanResult = {
  refs: ReferencedKey[];
  /**
   * Namespaces where `t(variable)` / `t.ns(...)` / `t.dynamic` was seen —
   * unused-key warnings for these namespaces are suppressed.
   */
  dynamicNamespaces: Set<string>;
  /**
   * Client `useT` + `t(variable)` without `t.dynamic` — runtime stub will throw.
   * Server `getT` non-literals are OK (whole namespace is loaded).
   */
  undeclaredDynamics: UndeclaredDynamic[];
};

/** Default directories scanned by `tongue check` / `extract`. */
export const DEFAULT_SCAN_ROOTS = [
  'app',
  'src',
  'components',
  'lib',
  'server',
  'actions',
] as const;

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
  roots: readonly string[] = DEFAULT_SCAN_ROOTS,
): Promise<ReferencedKey[]> {
  return (await scanKeys(cwd, roots)).refs;
}

export async function scanKeys(
  cwd: string,
  roots: readonly string[] = DEFAULT_SCAN_ROOTS,
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
  const undeclaredDynamics: UndeclaredDynamic[] = [];
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const rel = relative(cwd, file);
    const part = extractFromSource(src, rel);
    refs.push(...part.refs);
    for (const ns of part.dynamicNamespaces) dynamicNamespaces.add(ns);
    undeclaredDynamics.push(...part.undeclaredDynamics);
  }
  return { refs, dynamicNamespaces, undeclaredDynamics };
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

/** Strip // and /* *\/ comments; preserve newlines for line numbers. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];

    // string / template — copy verbatim so // inside strings stay
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < source.length) {
        const c = source[i]!;
        out += c;
        if (c === '\\' && i + 1 < source.length) {
          out += source[i + 1]!;
          i += 2;
          continue;
        }
        if (c === quote) {
          i++;
          break;
        }
        // template ${ } — shallow skip (good enough for comment strip)
        if (quote === '`' && c === '$' && source[i + 1] === '{') {
          out += '{';
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            out += source[i]!;
            i++;
          }
          continue;
        }
        i++;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

export function extractFromSource(
  source: string,
  file: string,
): ScanResult {
  const code = stripComments(source);
  const out: ReferencedKey[] = [];
  const dynamicNamespaces = new Set<string>();
  const undeclaredDynamics: UndeclaredDynamic[] = [];
  const translators = new Map<string, { ns: string; kind: 'useT' | 'getT' }>();

  // useT('ns') | getT('ns') | getT(locale, 'ns')
  const declRe =
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(useT|getT)\s*\(\s*(?:[^'"\n,]+,\s*)?(['"])([^'"]*)\3\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(code)) !== null) {
    translators.set(m[1]!, {
      ns: m[4] || '_root',
      kind: m[2] as 'useT' | 'getT',
    });
  }

  const push = (ns: string, key: string, index: number) => {
    const fullKey = ns === '_root' || ns === '' ? key : `${ns}.${key}`;
    out.push({
      fullKey,
      namespace: ns || '_root',
      key,
      file,
      line: lineAt(code, index),
    });
  };

  for (const [varName, { ns, kind }] of translators) {
    // Literal t('key') / t.rich('key')
    const callRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(['"])([^'"]+)\\1`,
      'g',
    );
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(code)) !== null) {
      push(ns, cm[2]!, cm.index);
    }

    // t.dynamic(any, { from }) — only resolvable `from` keys become refs
    for (const call of findDynamicCalls(code, varName)) {
      if (call.keys) {
        for (const key of call.keys) {
          push(ns, key, call.start);
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
    while ((nm = nsRe.exec(code)) !== null) {
      dynamicNamespaces.add(nm[2] || '_root');
    }

    // Non-literal t(var) — suppress unused for the namespace.
    // Client useT stubs throw — report each site. Server getT is fine.
    // Do NOT harvest unrelated string arrays (cache tags, sort keys, …).
    const nonLitRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(?!['"])([A-Za-z_$][\\w$]*)`,
      'g',
    );
    let nl: RegExpExecArray | null;
    let sawNonLit = false;
    while ((nl = nonLitRe.exec(code)) !== null) {
      sawNonLit = true;
      if (kind === 'useT') {
        undeclaredDynamics.push({
          file,
          line: lineAt(code, nl.index),
          name: varName,
          namespace: ns || '_root',
        });
      }
    }
    if (sawNonLit) {
      dynamicNamespaces.add(ns || '_root');
    }
  }

  return { refs: out, dynamicNamespaces, undeclaredDynamics };
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
