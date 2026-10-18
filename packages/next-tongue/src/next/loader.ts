/**
 * Per-file call-site loader for Turbopack / webpack (ADR 0001 / 0009).
 * Pure function of one file's source — no emitFile / loadModule / importModule.
 *
 * Rewrites:
 *   const t = useT('home'); t('inbox', { count })
 * into a static import of the per-key module when the key is a string literal.
 *
 * Also rewrites `t.dynamic(key, { from })` to a map of those imports when `from`
 * is an inline array, a same-file const array, or `Object.values(sameFileConst)`.
 *
 * Escape analysis: if `t` is passed around, falls back to namespace import + warning.
 */

import { findDynamicCalls } from '../compiler/dynamic-from.js';
import { safeIdent } from '../compiler/codegen/emit-js.js';

export type LoaderOptions = {
  /** Absolute or project-relative outDir (default .tongue) */
  outDir?: string;
};

export type LoaderResult = {
  code: string;
  warnings: string[];
};

const USE_T_DECL =
  /(?:const|let|var)\s+(\w+)\s*=\s*useT\s*\(\s*(['"])([^'"]*)\2\s*\)/g;

export function transformCallSites(
  source: string,
  resourcePath: string,
  _options: LoaderOptions = {},
): LoaderResult {
  const warnings: string[] = [];
  if (!source.includes('useT(')) {
    return { code: source, warnings };
  }

  const { directives, body: withoutDirs } = splitLeadingDirectives(source);

  const translators = new Map<string, string>(); // varName → namespace
  let m: RegExpExecArray | null;
  const declRe = new RegExp(USE_T_DECL.source, 'g');
  while ((m = declRe.exec(withoutDirs)) !== null) {
    translators.set(m[1]!, m[3] || '_root');
  }

  if (translators.size === 0) {
    return { code: source, warnings };
  }

  // Escape analysis: if t is used beyond property calls, warn and skip rewrite
  for (const [varName, ns] of translators) {
    if (escapes(withoutDirs, varName)) {
      warnings.push(
        `TONGUE_W_ESCAPE: ${resourcePath}: '${varName}' from useT('${ns}') escapes this file; importing whole namespace`,
      );
    }
  }

  const imports = new Map<string, { ns: string; key: string; ident: string }>();
  let code = withoutDirs;

  for (const [varName, ns] of translators) {
    if (escapes(withoutDirs, varName)) continue;

    // Literal t('key') / t.rich('key')
    const callRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(['"])([^'"]+)\\1`,
      'g',
    );
    code = code.replace(callRe, (full, _q: string, key: string) => {
      const ident = safeImportIdent(ns, key);
      imports.set(`${ns}:${key}`, { ns, key, ident });
      return full;
    });

    // t.dynamic(expr, { from }, values?) — collect resolvable keys
    for (const call of findDynamicCalls(withoutDirs, varName)) {
      if (!call.keys) continue;
      for (const key of call.keys) {
        const ident = safeImportIdent(ns, key);
        imports.set(`${ns}:${key}`, { ns, key, ident });
      }
    }
  }

  if (imports.size === 0) {
    return { code: source, warnings };
  }

  const importLines: string[] = [];
  const loadedCalls: string[] = [];
  for (const { ns, key, ident } of imports.values()) {
    const path = `#tongue/msg/${ns === '' ? '_root' : ns}/${key}.js`;
    importLines.push(`import { ${safeExport(key)} as ${ident} } from '${path}';`);
    loadedCalls.push(
      `process.env.NODE_ENV !== 'production' && globalThis.__tongueDevLoaded?.(${JSON.stringify(ns || '_root')}, ${JSON.stringify(key)});`,
    );
  }

  // Inject locale after every useT — one binding per translator var so each
  // component (and multi-useT in one function) has __tongue_locale_* in scope.
  for (const varName of translators.keys()) {
    if (escapes(withoutDirs, varName)) continue;
    const localeVar = localeVarFor(varName);
    const declRe = new RegExp(
      `((?:const|let|var)\\s+${escapeRegExp(varName)}\\s*=\\s*useT\\s*\\([^)]*\\))`,
      'g',
    );
    code = code.replace(declRe, (full) => {
      // Idempotent if a prior pass already injected.
      if (full.includes(localeVar)) return full;
      return `${full}\n  const ${localeVar} = useLocale();`;
    });
  }

  // Replace t.dynamic(expr, { from }, values?) — rewrite from the end so indices stay valid
  for (const [varName, ns] of translators) {
    if (escapes(withoutDirs, varName)) continue;
    const localeVar = localeVarFor(varName);
    const calls = findDynamicCalls(code, varName).filter((c) => c.keys && c.keys.length > 0);
    for (let ci = calls.length - 1; ci >= 0; ci--) {
      const call = calls[ci]!;
      const keys = call.keys!;
      const mapEntries = keys
        .map((key) => {
          const ident = safeImportIdent(ns, key);
          imports.set(`${ns}:${key}`, { ns, key, ident });
          return `${JSON.stringify(key)}: ${ident}`;
        })
        .join(', ');
      const valuesArg =
        call.valuesExpr != null && call.valuesExpr.trim() !== ''
          ? `, ${call.valuesExpr.trim()}`
          : '';
      const replacement = `((__tongue_dyn) => { const __tongue_fn = __tongue_dyn[${call.keyExpr.trim()}]; if (!__tongue_fn) throw new Error(${JSON.stringify(`[next-tongue] t.dynamic key not in from: [${keys.join(', ')}]`)}); return __tongue_fn(${localeVar}${valuesArg}); })({ ${mapEntries} })`;
      code = code.slice(0, call.start) + replacement + code.slice(call.end);
    }
  }

  // Replace t('key', values) / t.rich('key', values) with per-key calls
  for (const [varName, ns] of translators) {
    if (escapes(withoutDirs, varName)) continue;
    const localeVar = localeVarFor(varName);
    for (const { key, ident } of [...imports.values()].filter((i) => i.ns === ns)) {
      const richRe = new RegExp(
        `\\b${escapeRegExp(varName)}\\.rich\\s*\\(\\s*(['"])${escapeRegExp(key)}\\1\\s*(,\\s*([^)]*))?\\)`,
        'g',
      );
      code = code.replace(richRe, (_full, _q, _rest, values) => {
        if (values != null && String(values).trim() !== '') {
          return `${ident}.rich(${localeVar}, ${String(values).trim()})`;
        }
        return `${ident}.rich(${localeVar})`;
      });
      const re = new RegExp(
        `\\b${escapeRegExp(varName)}\\s*\\(\\s*(['"])${escapeRegExp(key)}\\1\\s*(,\\s*([^)]*))?\\)`,
        'g',
      );
      code = code.replace(re, (_full, _q, _rest, values) => {
        if (values != null && String(values).trim() !== '') {
          return `${ident}(${localeVar}, ${String(values).trim()})`;
        }
        return `${ident}(${localeVar})`;
      });
    }
  }

  let preamble = importLines.join('\n') + '\n';
  // Dev hooks are installed by TongueProvider's overlay gate onto globalThis —
  // no import, so production bundles stay free of overlay/registry modules.
  if (loadedCalls.length > 0) {
    preamble += loadedCalls.join('\n') + '\n';
  }
  if (!/useLocale/.test(preamble + code) || !/from\s+['"]next-tongue\/client['"]/.test(code)) {
    preamble += `import { useLocale } from 'next-tongue/client';\n`;
  }

  for (const [varName, ns] of translators) {
    if (!escapes(withoutDirs, varName)) continue;
    preamble +=
      `process.env.NODE_ENV !== 'production' && globalThis.__tongueDevEscape?.(` +
      `${JSON.stringify(ns || '_root')}, ${JSON.stringify(resourcePath)});\n`;
  }

  // "use client" / "use server" MUST be the first statement(s) — never after imports.
  return { code: directives + preamble + code, warnings };
}

/**
 * Peel leading `"use client"` / `"use server"` (and preceding comments/whitespace)
 * so we can re-emit them before any injected imports.
 */
export function splitLeadingDirectives(source: string): {
  directives: string;
  body: string;
} {
  let rest = source.replace(/^\uFEFF/, '');
  const found: string[] = [];

  while (rest.length > 0) {
    // leading whitespace / comments
    const lead = rest.match(/^((?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*)/);
    const leadLen = lead?.[0]?.length ?? 0;
    const afterLead = rest.slice(leadLen);
    const dir = afterLead.match(/^['"]use (client|server)['"];?[ \t]*(?:\r?\n)?/);
    if (!dir) break;
    found.push(`"use ${dir[1]}";`);
    rest = afterLead.slice(dir[0].length);
  }

  if (found.length === 0) {
    return { directives: '', body: source.replace(/^\uFEFF/, '') };
  }
  return {
    directives: found.join('\n') + '\n\n',
    body: rest,
  };
}

function escapes(source: string, varName: string): boolean {
  const v = escapeRegExp(varName);
  // Heuristic: return t, pass t, object shorthand, JSX prop, assignment
  const patterns = [
    new RegExp(`return\\s+${v}\\b`),
    new RegExp(`\\(\\s*${v}\\s*[,)]`),
    new RegExp(`:\\s*${v}\\b`),
    new RegExp(`=\\s*${v}\\s*[;,\n]`),
    new RegExp(`=\\{\\s*${v}\\s*\\}`), // translate={t}
    new RegExp(`\\{\\s*${v}\\s*[,}]`), // { t } / { t, ... }
  ];
  // Allow t('…') and t.rich / t.has / t.dynamic / t.ns
  const withoutCalls = source
    .replace(new RegExp(`\\b${v}\\.(rich|has|dynamic|ns)\\b`, 'g'), '')
    .replace(new RegExp(`\\b${v}\\s*\\(`, 'g'), '');
  return patterns.some((re) => re.test(withoutCalls));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Per-useT locale binding so each component function has its own in-scope var. */
function localeVarFor(varName: string): string {
  return varName === 't' ? '__tongue_locale' : `__tongue_locale_${varName}`;
}

function safeImportIdent(ns: string, key: string): string {
  return `__tongue_${(ns + '_' + key).replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function safeExport(key: string): string {
  return safeIdent(key);
}

/** Webpack/Turbopack loader entry. */
export default function tongueLoader(this: {
  resourcePath: string;
  getOptions?: () => LoaderOptions;
  async?: () => (err: Error | null, content?: string) => void;
  callback?: (err: Error | null, content?: string) => void;
}, source: string): string | void {
  const options = this.getOptions?.() ?? {};
  const { code, warnings } = transformCallSites(source, this.resourcePath, options);
  for (const w of warnings) {
    console.warn(`[next-tongue] ${w}`);
  }
  return code;
}
