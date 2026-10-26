/**
 * Read/write translation dictionaries: JSON or TS (`export default {…}`),
 * one file per locale (`messages/{locale}.json`) or per-locale folders
 * (`locales/{locale}/*.json` → file name becomes the first key segment).
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { TongueError } from '../errors.js';
import { resolveInsideProject } from '../cli/safe-path.js';

export type Flat = Record<string, string>;

type FileShape = { format: 'json' | 'ts'; prefix: string; suffix: string; data: Record<string, unknown> };

export type LoadedFile = { rel: string; keyPrefix: string; shape: FileShape };

export type Catalog = { flat: Flat; files: LoadedFile[] };

const META = /\$(description|meta)$|^\$meta$/;

export function isMetaKey(key: string): boolean {
  return META.test(key);
}

export function flatten(obj: Record<string, unknown>, prefix = '', out: Flat = {}): Flat {
  for (const [k, v] of Object.entries(obj)) {
    if (isMetaKey(k)) continue;
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[full] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Record<string, unknown>, full, out);
  }
  return out;
}

export function setPath(root: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export function deletePath(root: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  const stack: Array<Record<string, unknown>> = [root];
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (!next || typeof next !== 'object') return false;
    cur = next as Record<string, unknown>;
    stack.push(cur);
  }
  const last = parts[parts.length - 1]!;
  if (!(last in cur)) return false;
  delete cur[last];
  // prune empty parents
  for (let i = parts.length - 2; i >= 0; i--) {
    const parent = stack[i]!;
    const child = parent[parts[i]!] as Record<string, unknown>;
    if (child && Object.keys(child).length === 0) delete parent[parts[i]!];
    else break;
  }
  return true;
}

/** Find the `{…}` literal span after `export default` (or the first `= {`). */
function findLiteral(src: string): { start: number; end: number } | null {
  const m = /export\s+default\s*(?=\{)/.exec(src) ?? /=\s*(?=\{)/.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) === -1 ? src.length : src.indexOf('\n', i);
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return { start, end: i + 1 };
  }
  return null;
}

export function parseDictionary(src: string, file: string): FileShape {
  const format = /\.(json)$/i.test(file) ? 'json' : 'ts';
  if (format === 'json') {
    try {
      return { format, prefix: '', suffix: '\n', data: JSON.parse(src) as Record<string, unknown> };
    } catch (err) {
      throw new TongueError('TONGUE_E_PARSE', `${file}: invalid JSON (${err instanceof Error ? err.message : err})`);
    }
  }
  const span = findLiteral(src);
  if (!span) throw new TongueError('TONGUE_E_PARSE', `${file}: expected \`export default { … }\` object literal`);
  let data: unknown;
  try {
    // Evaluates a plain object literal only — no imports, no globals.
    data = runInNewContext(`(${src.slice(span.start, span.end)})`, Object.create(null), { timeout: 1000 });
  } catch (err) {
    throw new TongueError('TONGUE_E_PARSE', `${file}: dictionary must be a static object literal (${err instanceof Error ? err.message : err})`);
  }
  return { format, prefix: src.slice(0, span.start), suffix: src.slice(span.end), data: JSON.parse(JSON.stringify(data)) as Record<string, unknown> };
}

export function serializeDictionary(shape: FileShape): string {
  const body = JSON.stringify(shape.data, null, 2);
  if (shape.format === 'json') return `${body}\n`;
  return `${shape.prefix}${body}${shape.suffix}`;
}

/** Expand a pattern (with `{locale}` and optional `*` in the file name) for one locale. */
export async function expandPattern(cwd: string, pattern: string, locale: string): Promise<Array<{ rel: string; keyPrefix: string }>> {
  const rel = pattern.replaceAll('{locale}', locale).replace(/^\.\//, '');
  if (!rel.includes('*')) {
    try {
      await stat(resolveInsideProject(cwd, rel));
      return [{ rel, keyPrefix: '' }];
    } catch {
      return [];
    }
  }
  const dir = dirname(rel);
  const fileGlob = basename(rel);
  if (dir.includes('*')) throw new TongueError('TONGUE_E_CONFIG', `Only file-name wildcards are supported: ${pattern}`);
  const re = new RegExp(`^${fileGlob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.+)')}$`);
  let names: string[] = [];
  try {
    names = await readdir(resolveInsideProject(cwd, dir));
  } catch {
    return [];
  }
  return names
    .filter((n) => re.test(n))
    .sort()
    .map((n) => ({ rel: join(dir, n).split(sep).join('/'), keyPrefix: basename(n, extname(n)) }));
}

export async function readCatalog(cwd: string, patterns: readonly string[], locale: string): Promise<Catalog> {
  const flat: Flat = {};
  const files: LoadedFile[] = [];
  for (const pattern of patterns) {
    for (const { rel, keyPrefix } of await expandPattern(cwd, pattern, locale)) {
      const shape = parseDictionary(await readFile(resolveInsideProject(cwd, rel), 'utf8'), rel);
      files.push({ rel, keyPrefix, shape });
      flatten(shape.data, keyPrefix, flat);
    }
  }
  return { flat, files };
}

/**
 * Apply updates/deletions to a target locale, mirroring the source file
 * layout (new target files copy the source file's TS wrapper).
 */
export async function writeCatalog(args: {
  cwd: string;
  source: Catalog;
  sourceLocale: string;
  locale: string;
  set: Flat;
  remove: string[];
  dryRun?: boolean;
}): Promise<string[]> {
  const { cwd, source, sourceLocale, locale } = args;
  const touched = new Map<string, FileShape>();
  const target = async (sf: LoadedFile): Promise<{ rel: string; shape: FileShape }> => {
    const rel = swapLocale(sf.rel, sourceLocale, locale);
    const cached = touched.get(rel);
    if (cached) return { rel, shape: cached };
    let shape: FileShape;
    try {
      shape = parseDictionary(await readFile(resolveInsideProject(cwd, rel), 'utf8'), rel);
    } catch (err) {
      if (err instanceof TongueError) throw err;
      shape = { ...sf.shape, data: {} };
    }
    touched.set(rel, shape);
    return { rel, shape };
  };
  const owner = (key: string): LoadedFile | undefined =>
    source.files.find((f) => f.keyPrefix && (key === f.keyPrefix || key.startsWith(`${f.keyPrefix}.`))) ??
    source.files.find((f) => key in flatten(f.shape.data, f.keyPrefix)) ??
    source.files.find((f) => !f.keyPrefix);
  for (const [key, text] of Object.entries(args.set)) {
    const sf = owner(key);
    if (!sf) continue;
    const { shape } = await target(sf);
    setPath(shape.data, sf.keyPrefix ? key.slice(sf.keyPrefix.length + 1) : key, text);
  }
  for (const key of args.remove) {
    for (const sf of source.files) {
      if (sf.keyPrefix && !key.startsWith(`${sf.keyPrefix}.`)) continue;
      const { shape } = await target(sf);
      deletePath(shape.data, sf.keyPrefix ? key.slice(sf.keyPrefix.length + 1) : key);
    }
  }
  const written: string[] = [];
  for (const [rel, shape] of touched) {
    written.push(rel);
    if (args.dryRun) continue;
    const abs = resolveInsideProject(cwd, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, serializeDictionary(shape), 'utf8');
  }
  return written;
}

/** Replace the locale segment (`en.json`, `/en/`, `.en.json`) in a path. */
export function swapLocale(rel: string, from: string, to: string): string {
  const esc = from.replace(/[-.]/g, '\\$&');
  return rel.replace(new RegExp(`(^|[/.])${esc}(?=[/.]|$)`, 'g'), `$1${to}`);
}

// ---------- detection (wizard) ----------

export type Framework = 'next-app' | 'next-pages' | 'nuxt' | 'sveltekit' | 'remix' | 'vite' | 'node' | 'unknown';

export async function detectFramework(cwd: string): Promise<Framework> {
  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return 'unknown';
  }
  if (deps.next) {
    for (const d of ['app', 'src/app']) {
      try {
        if ((await stat(join(cwd, d))).isDirectory()) return 'next-app';
      } catch {
        /* next */
      }
    }
    return 'next-pages';
  }
  if (deps.nuxt) return 'nuxt';
  if (deps['@sveltejs/kit']) return 'sveltekit';
  if (deps['@remix-run/react'] || deps['react-router']) return 'remix';
  if (deps.vite) return 'vite';
  return 'node';
}

const LOCALE_RE = /^[a-z]{2,3}([-_][A-Za-z]{2,4})?$/;
const DICT_EXT = /\.(json|ts|mts|js|mjs)$/;
const CANDIDATE_DIRS = ['messages', 'locales', 'i18n', 'lang', 'translations', 'dictionaries', 'public/locales', 'src/messages', 'src/locales', 'src/i18n', 'src/dictionaries', 'app/i18n', 'app/dictionaries'];

export type DetectedLayout = { pattern: string; locales: string[]; files: number };

/** Find dictionary folders and turn them into `{locale}` patterns. */
export async function detectLayouts(cwd: string): Promise<DetectedLayout[]> {
  const found: DetectedLayout[] = [];
  for (const dir of CANDIDATE_DIRS) {
    let entries: string[];
    try {
      entries = await readdir(join(cwd, dir));
    } catch {
      continue;
    }
    // messages/en.json
    const perFile = new Map<string, string[]>();
    for (const e of entries) {
      const ext = extname(e);
      const stem = basename(e, ext);
      if (DICT_EXT.test(e) && LOCALE_RE.test(stem)) perFile.set(ext, [...(perFile.get(ext) ?? []), stem]);
    }
    for (const [ext, locs] of perFile) found.push({ pattern: `./${dir}/{locale}${ext}`, locales: locs.sort(), files: locs.length });
    // locales/en/*.json
    const perDir = new Map<string, { locales: Set<string>; files: number }>();
    for (const e of entries) {
      if (!LOCALE_RE.test(e)) continue;
      try {
        for (const n of (await readdir(join(cwd, dir, e))).filter((x) => DICT_EXT.test(x))) {
          const x = extname(n);
          const slot = perDir.get(x) ?? { locales: new Set<string>(), files: 0 };
          slot.locales.add(e);
          slot.files++;
          perDir.set(x, slot);
        }
      } catch {
        /* not a dir */
      }
    }
    for (const [x, slot] of perDir) found.push({ pattern: `./${dir}/{locale}/*${x}`, locales: [...slot.locales].sort(), files: slot.files });
  }
  return found;
}

export function relPath(cwd: string, abs: string): string {
  return relative(cwd, abs).split(sep).join('/');
}
