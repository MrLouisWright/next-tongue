/**
 * Per-file call-site loader for Turbopack / webpack (ADR 0001 / 0009).
 * Pure function of one file's source — no emitFile / loadModule / importModule.
 *
 * Rewrites:
 *   const t = useT('home'); t('inbox', { count })
 * into a static import of the per-key module when the key is a string literal.
 *
 * Escape analysis: if `t` is passed around, falls back to namespace import + warning.
 */

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

  const translators = new Map<string, string>(); // varName → namespace
  let m: RegExpExecArray | null;
  const declRe = new RegExp(USE_T_DECL.source, 'g');
  while ((m = declRe.exec(source)) !== null) {
    translators.set(m[1]!, m[3] || '_root');
  }

  if (translators.size === 0) {
    return { code: source, warnings };
  }

  // Escape analysis: if t is used beyond property calls, warn and skip rewrite
  for (const [varName, ns] of translators) {
    if (escapes(source, varName)) {
      warnings.push(
        `TONGUE_W_ESCAPE: ${resourcePath}: '${varName}' from useT('${ns}') escapes this file; importing whole namespace`,
      );
    }
  }

  const imports = new Map<string, { ns: string; key: string; ident: string }>();
  let code = source;

  for (const [varName, ns] of translators) {
    if (escapes(source, varName)) continue;

    const callRe = new RegExp(
      `\\b${escapeRegExp(varName)}(?:\\.rich)?\\s*\\(\\s*(['"])([^'"]+)\\1`,
      'g',
    );
    code = code.replace(callRe, (full, _q: string, key: string) => {
      const ident = safeImportIdent(ns, key);
      imports.set(`${ns}:${key}`, { ns, key, ident });
      return full;
    });
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

  const localeVar = '__tongue_locale';
  // Inject locale once after the first useT declaration
  code = code.replace(
    /((?:const|let|var)\s+\w+\s*=\s*useT\s*\([^)]*\))/,
    `$1\n  const ${localeVar} = useLocale();`,
  );

  // Second pass: replace t('key', values) / t.rich('key', values) with per-key calls
  for (const [varName, ns] of translators) {
    if (escapes(source, varName)) continue;
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
    if (!escapes(source, varName)) continue;
    preamble +=
      `process.env.NODE_ENV !== 'production' && globalThis.__tongueDevEscape?.(` +
      `${JSON.stringify(ns || '_root')}, ${JSON.stringify(resourcePath)});\n`;
  }

  return { code: preamble + code, warnings };
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

function safeImportIdent(ns: string, key: string): string {
  return `__tongue_${(ns + '_' + key).replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function safeExport(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || '_';
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
