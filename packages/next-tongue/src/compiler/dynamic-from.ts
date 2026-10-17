/**
 * Resolve `t.dynamic(key, { from })` key lists for the call-site loader and
 * `tongue check` scan. Supports:
 *   - inline arrays: `{ from: ['a', 'b'] }`
 *   - same-file const arrays: `const X = ['a', 'b']; { from: X }`
 *   - Object.values of same-file const objects: `{ from: Object.values(BTN_KEYS) }`
 *
 * Imported / computed `from` expressions are not resolved (left as stubs).
 */

export function extractStringLiterals(body: string): string[] {
  return [...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

/** Take a balanced `[...]` / `{...}` / `(...)` starting at `source[start]`. */
export function takeBalanced(
  source: string,
  start: number,
  open: string,
  close: string,
): string | null {
  if (source[start] !== open) return null;
  let depth = 0;
  let inStr: '"' | "'" | '`' | null = null;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\' && inStr !== '`') {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Index of `ident`'s `const|let|var` initializer expression, or -1. */
function findDeclInit(source: string, ident: string): number {
  const re = new RegExp(
    `(?:const|let|var)\\s+${escapeRegExp(ident)}\\s*=\\s*`,
    'g',
  );
  const m = re.exec(source);
  return m ? m.index + m[0].length : -1;
}

function skipWs(source: string, i: number): number {
  while (/\s/.test(source[i] ?? '')) i++;
  return i;
}

function resolveConstArrayKeys(source: string, ident: string): string[] | null {
  const init = findDeclInit(source, ident);
  if (init < 0) return null;
  const arr = takeBalanced(source, skipWs(source, init), '[', ']');
  if (!arr) return null;
  return extractStringLiterals(arr.slice(1, -1));
}

function resolveObjectValueKeys(source: string, ident: string): string[] | null {
  const init = findDeclInit(source, ident);
  if (init < 0) return null;
  // Type assertions (`as const`) sit after the literal; object is first.
  const obj = takeBalanced(source, skipWs(source, init), '{', '}');
  if (!obj) return null;
  return [...obj.matchAll(/:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

/**
 * Resolve keys from a `from` expression text (already sliced out of the call).
 * Returns null when the expression cannot be resolved statically in-file.
 */
export function resolveFromKeys(
  fileSource: string,
  fromExpr: string,
): string[] | null {
  const trimmed = fromExpr.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('[')) {
    const arr = takeBalanced(trimmed, 0, '[', ']');
    if (!arr) return null;
    return extractStringLiterals(arr.slice(1, -1));
  }

  const ov = /^Object\.values\(\s*([A-Za-z_$][\w$]*)\s*\)$/.exec(trimmed);
  if (ov) {
    const keys = resolveObjectValueKeys(fileSource, ov[1]!);
    return keys && keys.length > 0 ? keys : null;
  }

  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    const keys = resolveConstArrayKeys(fileSource, trimmed);
    return keys && keys.length > 0 ? keys : null;
  }

  return null;
}

export type DynamicCallSite = {
  /** Start of `t.dynamic` */
  start: number;
  /** End after closing `)` */
  end: number;
  keyExpr: string;
  fromExpr: string;
  valuesExpr: string | null;
  keys: string[] | null;
};

/**
 * Find `varName.dynamic(...)` call sites and resolve their `from` keys.
 */
export function findDynamicCalls(
  source: string,
  varName: string,
): DynamicCallSite[] {
  const re = new RegExp(`\\b${escapeRegExp(varName)}\\.dynamic\\s*\\(`, 'g');
  const out: DynamicCallSite[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const parsed = parseDynamicArgs(source, openParen);
    if (!parsed) continue;
    const keys = resolveFromKeys(source, parsed.fromExpr);
    out.push({
      start: m.index,
      end: parsed.closeParen + 1,
      keyExpr: parsed.keyExpr,
      fromExpr: parsed.fromExpr,
      valuesExpr: parsed.valuesExpr,
      keys,
    });
  }
  return out;
}

function parseDynamicArgs(
  source: string,
  openParen: number,
): {
  keyExpr: string;
  fromExpr: string;
  valuesExpr: string | null;
  closeParen: number;
} | null {
  let i = openParen + 1;
  while (/\s/.test(source[i] ?? '')) i++;

  const keyStart = i;
  i = scanArgEnd(source, i);
  if (i < 0 || source[i] !== ',') return null;
  const keyExpr = source.slice(keyStart, i).trim();
  i++;
  while (/\s/.test(source[i] ?? '')) i++;

  if (source[i] !== '{') return null;
  const opts = takeBalanced(source, i, '{', '}');
  if (!opts) return null;
  const optsEnd = i + opts.length;
  const fromExpr = extractFromProp(opts);
  if (fromExpr == null) return null;

  i = optsEnd;
  while (/\s/.test(source[i] ?? '')) i++;
  let valuesExpr: string | null = null;
  if (source[i] === ',') {
    i++;
    while (/\s/.test(source[i] ?? '')) i++;
    const valuesStart = i;
    i = scanArgEnd(source, i);
    if (i < 0) return null;
    valuesExpr = source.slice(valuesStart, i).trim() || null;
  }
  while (/\s/.test(source[i] ?? '')) i++;
  if (source[i] !== ')') return null;
  return { keyExpr, fromExpr, valuesExpr, closeParen: i };
}

/** Scan to next top-level `,` or `)` (not inside strings/brackets). */
function scanArgEnd(source: string, start: number): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inStr: '"' | "'" | '`' | null = null;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\' && inStr !== '`') {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '(') depthParen++;
    else if (c === ')') {
      if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) return i;
      depthParen--;
    } else if (c === '[') depthBracket++;
    else if (c === ']') depthBracket--;
    else if (c === '{') depthBrace++;
    else if (c === '}') depthBrace--;
    else if (
      c === ',' &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      return i;
    }
  }
  return -1;
}

function extractFromProp(optsLiteral: string): string | null {
  // optsLiteral includes surrounding braces
  const inner = optsLiteral.slice(1, -1);
  const fromIdx = /\bfrom\s*:/.exec(inner);
  if (!fromIdx) return null;
  let i = fromIdx.index + fromIdx[0].length;
  while (/\s/.test(inner[i] ?? '')) i++;

  if (inner[i] === '[') {
    const arr = takeBalanced(inner, i, '[', ']');
    return arr;
  }

  const ov = /^Object\.values\(\s*[A-Za-z_$][\w$]*\s*\)/.exec(inner.slice(i));
  if (ov) return ov[0];

  const id = /^[A-Za-z_$][\w$]*/.exec(inner.slice(i));
  return id ? id[0] : null;
}
