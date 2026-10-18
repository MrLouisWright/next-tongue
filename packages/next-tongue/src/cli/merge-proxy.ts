export type MergeProxyOptions = {
  locales: readonly string[];
  defaultLocale: string;
  prefix: string;
};

export type MergeProxyResult =
  | { status: 'unchanged'; reason: string; code: string }
  | { status: 'merged'; code: string; note?: string };

const CREATE_PROXY_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*['"]next-tongue\/proxy['"]/;

/**
 * Merge `createProxy({ locales, defaultLocale, prefix })` into an existing
 * proxy.ts / middleware.ts without wiping user logic.
 *
 * - Adds the import + `const tongue = createProxy(...)`.
 * - Replaces bare `return NextResponse.next()` with `return tongue(<req>)`
 *   using the handler's first parameter name.
 * - If already using `createProxy`, leaves the file alone.
 */
export function mergeProxySource(
  source: string,
  opts: MergeProxyOptions,
): MergeProxyResult {
  if (/\bcreateProxy\s*\(/.test(source)) {
    return {
      status: 'unchanged',
      reason: 'createProxy already present',
      code: source,
    };
  }

  let code = source.replace(/^\uFEFF/, '');
  const reqIdent = detectRequestIdent(code) ?? 'req';
  const tongueIdent = /\btongue\b/.test(code) ? '__tongueProxy' : 'tongue';

  code = ensureCreateProxyImport(code);
  code = insertTongueConst(code, tongueIdent, opts);

  // Only the *last* NextResponse.next() — early returns for /api etc. stay passthrough.
  const replaced = replaceLastNextReturn(code, tongueIdent, reqIdent);
  if (replaced) {
    return {
      status: 'merged',
      code: ensureTrailingNewline(replaced),
      note:
        `Replaced final NextResponse.next() with ${tongueIdent}(${reqIdent}). ` +
        `Early next() returns (allow-lists) are kept. ` +
        `If you stamp CSP/nonce on next(), use createProxy({ wrapResponse }) or mergeProxyResponse — see routing docs.`,
    };
  }

  // No next() — wrap exported handler so user logic runs first, then tongue.
  const wrapped = wrapExportedHandler(code, tongueIdent, reqIdent);
  if (wrapped) {
    return {
      status: 'merged',
      code: ensureTrailingNewline(wrapped),
      note:
        `Wrapped existing handler: non-passthrough user Response wins (auth/maintenance); ` +
        `passthrough next() → ${tongueIdent} with mergeProxyResponse (keeps CSP/nonce). ` +
        `Rewrites to paths under [locale] must include the locale segment.`,
    };
  }

  return {
    status: 'unchanged',
    reason:
      'could not find NextResponse.next() or an exportable proxy/middleware handler to wrap',
    code: source,
  };
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`;
}

function ensureCreateProxyImport(code: string): string {
  if (CREATE_PROXY_IMPORT.test(code)) {
    return code.replace(CREATE_PROXY_IMPORT, (full, specs: string) => {
      if (/\bcreateProxy\b/.test(specs)) return full;
      const parts = specs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      parts.push('createProxy');
      return full.replace(specs, ` ${parts.join(', ')} `);
    });
  }
  const importBlock = `import { createProxy } from 'next-tongue/proxy';\n`;
  // After last import, or at top
  const lastImport = [...code.matchAll(/^import\s.+;?\s*$/gm)].pop();
  if (lastImport && lastImport.index != null) {
    const end = lastImport.index + lastImport[0].length;
    return code.slice(0, end) + '\n' + importBlock + code.slice(end);
  }
  return importBlock + code;
}

function insertTongueConst(
  code: string,
  tongueIdent: string,
  opts: MergeProxyOptions,
): string {
  if (new RegExp(`\\b(?:const|let|var)\\s+${tongueIdent}\\s*=`).test(code)) {
    return code;
  }
  const decl =
    `const ${tongueIdent} = createProxy({\n` +
    `  locales: ${JSON.stringify([...opts.locales])},\n` +
    `  defaultLocale: ${JSON.stringify(opts.defaultLocale)},\n` +
    `  prefix: ${JSON.stringify(opts.prefix)},\n` +
    `});\n`;

  // Prefer after imports / 'use …' directives
  const lastImport = [...code.matchAll(/^import\s.+;?\s*$/gm)].pop();
  if (lastImport && lastImport.index != null) {
    const end = lastImport.index + lastImport[0].length;
    return code.slice(0, end) + '\n\n' + decl + code.slice(end);
  }
  return decl + '\n' + code;
}

function replaceLastNextReturn(
  code: string,
  tongueIdent: string,
  reqIdent: string,
): string | null {
  const re = /\breturn\s+NextResponse\.next\s*\(\s*\)\s*;?/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) last = m;
  if (!last) return null;
  return (
    code.slice(0, last.index) +
    `return ${tongueIdent}(${reqIdent});` +
    code.slice(last.index + last[0].length)
  );
}

function detectRequestIdent(code: string): string | null {
  const m =
    /export\s+(?:async\s+)?function\s+(?:proxy|middleware)\s*\(\s*([A-Za-z_$][\w$]*)/.exec(
      code,
    ) ??
    /export\s+const\s+(?:proxy|middleware)\s*=\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)/.exec(
      code,
    );
  return m?.[1] ?? null;
}

/**
 * Rename `export function proxy/middleware` → internal, add wrapper that
 * prefers a non-passthrough user Response then falls back to tongue.
 */
function wrapExportedHandler(
  code: string,
  tongueIdent: string,
  reqIdent: string,
): string | null {
  const fnRe =
    /export\s+(async\s+)?function\s+(proxy|middleware)\s*\(/;
  const m = fnRe.exec(code);
  if (!m || m.index == null) return null;

  const asyncKw = m[1] ?? '';
  const name = m[2]!;
  const inner = `__tongue_user_${name}`;
  let out = code.slice(0, m.index) + `${asyncKw}function ${inner}(` + code.slice(m.index + m[0].length);

  // Prefer non-passthrough user Response (auth redirect, maintenance rewrite).
  // Passthrough next() → tongue, then mergeProxyResponse so CSP/nonce on the
  // user next() are not dropped.
  out = ensureMergeProxyResponseImport(out);
  // Outer wrapper is always async — createProxy returns a Promise.
  out +=
    `\n\nexport async function ${name}(${reqIdent}: Parameters<typeof ${inner}>[0]) {\n` +
    `  const __user = ${asyncKw ? 'await ' : ''}${inner}(${reqIdent});\n` +
    `  if (__user && __user.headers?.get?.('x-middleware-next') !== '1') return __user;\n` +
    `  const __tongue = await ${tongueIdent}(${reqIdent});\n` +
    `  return __user ? mergeProxyResponse(__user, __tongue) : __tongue;\n` +
    `}\n`;

  return out;
}

function ensureMergeProxyResponseImport(code: string): string {
  if (/\bmergeProxyResponse\b/.test(code) && CREATE_PROXY_IMPORT.test(code)) {
    return code.replace(CREATE_PROXY_IMPORT, (full, specs: string) => {
      if (/\bmergeProxyResponse\b/.test(specs)) return full;
      const parts = specs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      parts.push('mergeProxyResponse');
      return full.replace(specs, ` ${parts.join(', ')} `);
    });
  }
  // ensureCreateProxyImport already ran — add mergeProxyResponse to that import
  if (CREATE_PROXY_IMPORT.test(code)) {
    return code.replace(CREATE_PROXY_IMPORT, (full, specs: string) => {
      if (/\bmergeProxyResponse\b/.test(specs)) return full;
      const parts = specs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.includes('createProxy')) parts.unshift('createProxy');
      parts.push('mergeProxyResponse');
      return full.replace(specs, ` ${parts.join(', ')} `);
    });
  }
  return code;
}

export const PROXY_CANDIDATES = [
  'proxy.ts',
  'proxy.js',
  'src/proxy.ts',
  'src/proxy.js',
  'middleware.ts',
  'middleware.js',
  'src/middleware.ts',
  'src/middleware.js',
] as const;

/** Relative path of an existing proxy/middleware file, or null. */
export async function findExistingProxyPath(
  cwd: string,
  exists: (rel: string) => Promise<boolean>,
): Promise<string | null> {
  for (const p of PROXY_CANDIDATES) {
    if (await exists(p)) return p;
  }
  return null;
}
