import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ResolvedTongueConfig } from '../config/types.js';
import { TongueError } from '../errors.js';
import { collectArgs, type MessageAst } from './ast.js';
import { parseMessage } from './parse/icu-parser.js';
import { loadLocaleMessages } from './load-messages.js';
import { resolveFallbackChain } from './fallback.js';
import { checkPluralCategories } from './validate/plurals.js';
import { emitMessageFunction, safeIdent } from './codegen/emit-js.js';
import { emitTypesFile, type NamespaceTypes } from './codegen/emit-types.js';

export type BuildResult = {
  outDir: string;
  locales: readonly string[];
  namespaces: string[];
  keyCount: number;
  hash: string;
};

export type BuildOptions = {
  config: ResolvedTongueConfig;
  cwd: string;
  /** Skip rewriting files when content hash matches (idempotent). */
  idempotent?: boolean;
};

export async function buildMessages(options: BuildOptions): Promise<BuildResult> {
  const { config, cwd } = options;
  const outDir = resolve(cwd, config.outDir);
  const catalogs = await loadLocaleMessages(config, cwd);

  const defaultCatalog = catalogs[config.defaultLocale];
  if (!defaultCatalog) {
    throw new TongueError(
      'TONGUE_E_BUILD',
      `Default locale "${config.defaultLocale}" has no messages`,
    );
  }

  // Parse default locale; types come from it
  type ParsedKey = {
    namespace: string;
    key: string;
    fullKey: string;
    asts: Record<string, MessageAst>;
  };

  const keys: ParsedKey[] = [];
  const nsTypes: NamespaceTypes = {};

  for (const [ns, messages] of Object.entries(defaultCatalog)) {
    for (const [key, source] of Object.entries(messages)) {
      const fullKey = ns === '_root' ? key : `${ns}.${key}`;
      const file = config.messages.replaceAll('{locale}', config.defaultLocale);
      const ast = parseMessage(source, { file, key: fullKey });
      const args = collectArgs(ast);
      (nsTypes[ns] ??= {})[key] = args;

      const asts: Record<string, MessageAst> = {
        [config.defaultLocale]: ast,
      };

      for (const locale of config.locales) {
        if (locale === config.defaultLocale) continue;
        const chain = resolveFallbackChain(locale, config.defaultLocale, config.fallback);
        let resolved: string | undefined;
        let resolvedLocale = locale;
        for (const candidate of chain) {
          const msg = catalogs[candidate]?.[ns]?.[key];
          if (msg != null) {
            resolved = msg;
            resolvedLocale = candidate;
            break;
          }
        }
        if (resolved == null) {
          if (config.strict.missing === 'error') {
            throw new TongueError(
              'TONGUE_E_BUILD',
              `Missing key "${fullKey}" in locale "${locale}"`,
              { file, key: fullKey },
            );
          }
          resolved = source;
          resolvedLocale = config.defaultLocale;
        }
        const lastAst = parseMessage(resolved, {
          file: config.messages.replaceAll('{locale}', resolvedLocale),
          key: fullKey,
        });
        // Cross-locale arg parity
        const otherArgs = collectArgs(lastAst);
        if (config.strict.mismatch !== 'off') {
          const missing = Object.keys(args).filter((a) => !(a in otherArgs));
          const extra = Object.keys(otherArgs).filter((a) => !(a in args));
          if (missing.length || extra.length) {
            const msg = `ICU arg mismatch for "${fullKey}" in "${locale}": missing=[${missing}] extra=[${extra}]`;
            if (config.strict.mismatch === 'error') {
              throw new TongueError('TONGUE_E_BUILD', msg, { key: fullKey });
            }
            console.warn(`tongue: ${msg}`);
          }
        }
        if (config.strict.mismatch !== 'off') {
          const pluralIssues = checkPluralCategories(lastAst, locale).filter(
            (i) => i.kind === 'extra-category',
          );
          for (const issue of pluralIssues) {
            const msg = `Locale "${locale}" uses plural category "${issue.category}" which CLDR does not define for it (${fullKey})`;
            if (config.strict.mismatch === 'error') {
              throw new TongueError('TONGUE_E_BUILD', msg, { key: fullKey });
            }
            console.warn(`tongue: ${msg}`);
          }
        }
        asts[locale] = lastAst;
      }

      keys.push({ namespace: ns, key, fullKey, asts });
    }
  }

  // Content hash for idempotency (bump CODEGEN_VERSION when emit format changes)
  const CODEGEN_VERSION = 2;
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        codegen: CODEGEN_VERSION,
        config: summarizeConfig(config),
        catalogs,
      }),
    )
    .digest('hex')
    .slice(0, 16);

  const hashPath = join(outDir, '.hash');
  if (options.idempotent !== false) {
    try {
      const prev = await readFile(hashPath, 'utf8');
      if (prev.trim() === hash) {
        return {
          outDir,
          locales: config.locales,
          namespaces: Object.keys(nsTypes),
          keyCount: keys.length,
          hash,
        };
      }
    } catch {
      /* rebuild */
    }
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'msg'), { recursive: true });
  await mkdir(join(outDir, 'ns'), { recursive: true });

  const emitCtxBase = {
    timeZone: config.timeZone,
    formats: {
      number: config.formats.number,
      dateTime: config.formats.dateTime,
    },
  };

  // Per-key modules: all locales inlined, select by locale arg
  for (const item of keys) {
    const dir = join(outDir, 'msg', item.namespace === '_root' ? '_root' : item.namespace);
    await mkdir(dir, { recursive: true });
    const exportName = safeIdent(item.key);
    const parts: string[] = [`// ${item.fullKey}`];
    for (const locale of config.locales) {
      const ast = item.asts[locale]!;
      const fnName = `_${safeIdent(locale)}`;
      const fn = emitMessageFunction(fnName, ast, { ...emitCtxBase, locale }, {
        withLocaleArg: false,
      });
      parts.push(fn.replace(`export function ${fnName}`, `function ${fnName}`));
    }
    const branches = config.locales.map((l, i) => {
      const call = `_${safeIdent(l)}(values)`;
      if (i === config.locales.length - 1) return `  return ${call};`;
      return `  if (locale === ${JSON.stringify(l)}) return ${call};`;
    });
    parts.push(
      `export function ${exportName}(locale, values) {\n${branches.join('\n')}\n}\n`,
    );
    await writeFile(join(dir, `${item.key}.js`), parts.join('\n'), 'utf8');
  }

  // Per-namespace modules for server / t.ns
  for (const ns of Object.keys(nsTypes)) {
    const nsKeys = keys.filter((k) => k.namespace === ns);
    const lines: string[] = [`// namespace ${ns}`];
    for (const item of nsKeys) {
      const exportName = safeIdent(item.key);
      const rel = `../msg/${ns === '_root' ? '_root' : ns}/${item.key}.js`;
      lines.push(`import { ${exportName} } from '${rel}';`);
    }
    lines.push(`export const messages = {`);
    for (const item of nsKeys) {
      lines.push(`  ${JSON.stringify(item.key)}: ${safeIdent(item.key)},`);
    }
    lines.push(`};`);
    lines.push(
      `export function createT(locale) {\n` +
        `  const t = (key, values) => {\n` +
        `    const fn = messages[key];\n` +
        `    if (!fn) throw new Error('Unknown key: ' + key);\n` +
        `    return fn(locale, values);\n` +
        `  };\n` +
        `  t.has = (key) => Object.prototype.hasOwnProperty.call(messages, key);\n` +
        `  return t;\n` +
        `}\n`,
    );
    await writeFile(join(outDir, 'ns', `${ns}.js`), lines.join('\n') + '\n', 'utf8');
    await writeFile(
      join(outDir, 'ns', `${ns}.d.ts`),
      [
        `/** Generated by next-tongue — do not edit. */`,
        `export declare const messages: Record<`,
        `  string,`,
        `  (locale: string, values?: Record<string, unknown>) => string`,
        `>;`,
        `export declare function createT(locale: string): {`,
        `  (key: string, values?: Record<string, unknown>): string;`,
        `  has(key: string): boolean;`,
        `};`,
        ``,
      ].join('\n'),
      'utf8',
    );
  }

  // Types
  await writeFile(
    join(outDir, 'types.d.ts'),
    emitTypesFile({
      locales: config.locales,
      namespaces: nsTypes,
      ...(config.routing.pathnames
        ? { pathnames: Object.keys(config.routing.pathnames) }
        : {}),
    }),
    'utf8',
  );

  // Manifest
  const manifest = {
    version: 1,
    hash,
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    timeZone: config.timeZone,
    keys: keys.map((k) => ({ namespace: k.namespace, key: k.key, fullKey: k.fullKey })),
    fallback: Object.fromEntries(
      config.locales.map((l) => [
        l,
        resolveFallbackChain(l, config.defaultLocale, config.fallback),
      ]),
    ),
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(hashPath, hash, 'utf8');

  // package.json imports helper note — apps map "#tongue/*" themselves / via withTongue
  await writeFile(
    join(outDir, 'README.md'),
    'Generated by next-tongue. Do not edit. Map `#tongue/*` → this directory.\n',
    'utf8',
  );

  return {
    outDir,
    locales: config.locales,
    namespaces: Object.keys(nsTypes),
    keyCount: keys.length,
    hash,
  };
}

function summarizeConfig(config: ResolvedTongueConfig) {
  return {
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    messages: config.messages,
    fallback: config.fallback,
    timeZone: config.timeZone,
    outDir: config.outDir,
    formats: config.formats,
    strict: config.strict,
  };
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}
