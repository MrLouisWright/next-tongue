import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ResolvedTongueConfig } from '../config/types.js';
import { TongueError } from '../errors.js';
import { collectArgs, type MessageAst } from './ast.js';
import { parseMessage } from './parse/icu-parser.js';
import { loadLocaleMessages, resolveMessagePath } from './load-messages.js';
import { resolveFallbackChain } from './fallback.js';
import { checkPluralCategories } from './validate/plurals.js';
import {
  emitMessageFunction,
  emitRichMessageFunction,
  hasTags,
  safeIdent,
} from './codegen/emit-js.js';
import { emitTypesFile, type NamespaceTypes } from './codegen/emit-types.js';
import { pseudoLocalizeAst } from './pseudo.js';
import { emitLocaleMatcherModule } from '../proxy/locale-matcher.js';
import { locateMessageKeys } from './json-locations.js';
import { scanAppRoutes } from './scan-routes.js';
import { loadAndMergeSources, writeSourcesCache } from './sources.js';

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
  /** Final `.tongue` path; may briefly point at a staging dir while writing. */
  let outDir = resolve(cwd, config.outDir);
  const publishedOutDir = outDir;
  const fileCatalogs = await loadLocaleMessages(config, cwd);
  const { catalogs, payloads: sourcePayloads } = await loadAndMergeSources(
    config,
    cwd,
    fileCatalogs,
  );

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
    /** Locales whose message was filled from another locale. */
    fallbackFrom: Record<string, string>;
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
      const fallbackFrom: Record<string, string> = {};

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
        if (resolvedLocale !== locale) {
          fallbackFrom[locale] = resolvedLocale;
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

      if (config.pseudo && config.pseudo.enabled !== false) {
        const pl = config.pseudo.locale;
        asts[pl] = pseudoLocalizeAst(asts[config.defaultLocale]!, {
          expand: config.pseudo.expand,
        });
      }

      keys.push({ namespace: ns, key, fullKey, asts, fallbackFrom });
    }
  }

  // Source locations for overlay click-to-key (default locale JSON).
  const defaultMsgAbs = resolveMessagePath(cwd, config.messages, config.defaultLocale);
  let keyLocations: Record<string, number> = {};
  try {
    const rawDefault = await readFile(defaultMsgAbs, 'utf8');
    keyLocations = locateMessageKeys(
      rawDefault,
      keys.map((k) => k.fullKey),
    );
  } catch {
    /* overlay src optional */
  }
  const defaultMsgRel = config.messages.replaceAll(
    '{locale}',
    config.defaultLocale,
  );

  const emitLocales = localesForEmit(config);

  // Content hash for idempotency (bump CODEGEN_VERSION when emit format changes)
  // Bump when emit shape changes (reserved idents, auto ensureTongue, routing export).
  const CODEGEN_VERSION = 10;
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
          locales: emitLocales,
          namespaces: Object.keys(nsTypes),
          keyCount: keys.length,
          hash,
        };
      }
    } catch {
      /* rebuild */
    }
  }

  // Write into a staging dir, then atomically replace `.tongue` (avoids ENOTEMPTY
  // when the previous tree is partially locked by the bundler / another build).
  const staging = `${publishedOutDir}.tmp-${process.pid}`;
  await clearOutputDir(staging);
  outDir = staging;
  await mkdir(join(outDir, 'msg'), { recursive: true });
  await mkdir(join(outDir, 'ns'), { recursive: true });
  if (sourcePayloads.length) {
    await writeSourcesCache(cwd, staging, sourcePayloads);
  }

  // Shared rich-text helpers (imported by per-key modules that contain tags)
  await writeFile(
    join(outDir, 'rich.js'),
    [
      `/** Generated by next-tongue — do not edit. */`,
      `import { createElement, Fragment } from 'react';`,
      `export function richJoin(parts) {`,
      `  if (parts.length === 0) return null;`,
      `  if (parts.length === 1) return parts[0];`,
      `  return parts;`,
      `}`,
      `export function richTag(handler, chunks, index) {`,
      `  const node = (handler ?? ((c) => c))(chunks);`,
      `  return createElement(Fragment, { key: 'tongue-t' + index }, node);`,
      `}`,
      `export function richSelf(handler, index) {`,
      `  const node = (handler ?? (() => null))();`,
      `  return createElement(Fragment, { key: 'tongue-t' + index }, node);`,
      `}`,
      ``,
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(outDir, 'rich.d.ts'),
    [
      `/** Generated by next-tongue — do not edit. */`,
      `import type { ReactNode } from 'react';`,
      `export declare function richJoin(parts: ReactNode[]): ReactNode;`,
      `export declare function richTag(`,
      `  handler: ((chunks: ReactNode) => ReactNode) | undefined,`,
      `  chunks: ReactNode,`,
      `  index: number,`,
      `): ReactNode;`,
      `export declare function richSelf(`,
      `  handler: (() => ReactNode) | undefined,`,
      `  index: number,`,
      `): ReactNode;`,
      ``,
    ].join('\n'),
    'utf8',
  );

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
    const needsRich = Object.values(item.asts).some((ast) => hasTags(ast));
    const parts: string[] = [`// ${item.fullKey}`];
    if (needsRich) {
      parts.push(
        `import { richJoin as _rj, richTag as _rt, richSelf as _rs } from '../../rich.js';\n`,
      );
    }
    for (const locale of emitLocales) {
      const ast = item.asts[locale]!;
      const fnName = `_${safeIdent(locale)}`;
      parts.push(
        emitMessageFunction(fnName, ast, { ...emitCtxBase, locale }, {
          withLocaleArg: false,
          exported: false,
        }),
      );
      if (needsRich) {
        parts.push(
          emitRichMessageFunction(`${fnName}$rich`, ast, { ...emitCtxBase, locale }, {
            withLocaleArg: false,
            exported: false,
          }),
        );
      }
    }
    const line = keyLocations[item.fullKey];
    const srcRef =
      line != null ? `${defaultMsgRel}:${line}` : defaultMsgRel;
    const fallbackJson = JSON.stringify(item.fallbackFrom);
    const hasFallback = Object.keys(item.fallbackFrom).length > 0;

    const branches = emitLocales.map((l, i) => {
      const call = `_${safeIdent(l)}(values)`;
      if (emitLocales.length === 1) return `  __out = ${call};`;
      if (i === 0) return `  if (locale === ${JSON.stringify(l)}) __out = ${call};`;
      if (i === emitLocales.length - 1) return `  else __out = ${call};`;
      return `  else if (locale === ${JSON.stringify(l)}) __out = ${call};`;
    });
    parts.push(
      `export function ${exportName}(locale, values) {\n` +
        `  let __out;\n` +
        `${branches.join('\n')}\n` +
        `  if (process.env.NODE_ENV !== 'production') {\n` +
        `    const __fb = ${hasFallback ? `${fallbackJson}[locale]` : 'undefined'};\n` +
        `    globalThis.__tongueDevReport?.({ fullKey: ${JSON.stringify(item.fullKey)}, locale, text: __out, src: ${JSON.stringify(srcRef)}, fallbackFrom: __fb });\n` +
        `  }\n` +
        `  return __out;\n` +
        `}\n`,
    );
    if (needsRich) {
      const richBranches = emitLocales.map((l, i) => {
        const call = `_${safeIdent(l)}$rich(values)`;
        if (i === emitLocales.length - 1) return `  return ${call};`;
        return `  if (locale === ${JSON.stringify(l)}) return ${call};`;
      });
      parts.push(
        `${exportName}.rich = function(locale, values) {\n${richBranches.join('\n')}\n};\n`,
      );
    } else {
      parts.push(`${exportName}.rich = ${exportName};\n`);
    }
    // Dev-only key ids for the overlay; stripped when NODE_ENV=production (#35).
    parts.push(
      `if (process.env.NODE_ENV !== 'production') {\n` +
        `  ${exportName}.__tongueKey = ${JSON.stringify(item.fullKey)};\n` +
        `  ${exportName}.__tongueSrc = ${JSON.stringify(srcRef)};\n` +
        (hasFallback
          ? `  ${exportName}.__tongueFallback = ${fallbackJson};\n`
          : '') +
        `}\n`,
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
        `  t.rich = (key, values) => {\n` +
        `    const fn = messages[key];\n` +
        `    if (!fn) throw new Error('Unknown key: ' + key);\n` +
        `    return typeof fn.rich === 'function' ? fn.rich(locale, values) : fn(locale, values);\n` +
        `  };\n` +
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
        `  rich(key: string, values?: Record<string, unknown>): unknown;`,
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
      locales: emitLocales,
      namespaces: nsTypes,
      ...(config.routing.pathnames
        ? { pathnames: Object.keys(config.routing.pathnames) }
        : {}),
    }),
    'utf8',
  );

  // App bootstrap: static imports of every namespace (Turbopack-safe)
  const nsNames = Object.keys(nsTypes);
  const productionLocales = [...config.locales];
  const runtimeLines: string[] = [
    `/** Generated by next-tongue — do not edit. */`,
    `import { __setServerRuntime, configureFormatMessage } from 'next-tongue/server';`,
  ];
  for (const ns of nsNames) {
    const ident = `ns_${safeIdent(ns)}`;
    runtimeLines.push(`import { messages as ${ident} } from './ns/${ns}.js';`);
  }
  runtimeLines.push(`const namespaces = {`);
  for (const ns of nsNames) {
    runtimeLines.push(`  ${JSON.stringify(ns)}: ns_${safeIdent(ns)},`);
  }
  runtimeLines.push(`};`);
  const pseudoDevOnly =
    config.pseudo &&
    config.pseudo.enabled === 'dev' &&
    !productionLocales.includes(config.pseudo.locale);
  runtimeLines.push(
    `export const allLocales = ${JSON.stringify([...emitLocales])};`,
    `const productionLocales = ${JSON.stringify(productionLocales)};`,
    pseudoDevOnly
      ? `export const locales = process.env.NODE_ENV === 'production' ? productionLocales : allLocales;`
      : `export const locales = allLocales;`,
    `export const defaultLocale = ${JSON.stringify(config.defaultLocale)};`,
    `export const prefix = ${JSON.stringify(config.routing.prefix)};`,
    `export const timeZone = ${JSON.stringify(config.timeZone)};`,
    config.pseudo && config.pseudo.enabled !== false
      ? `export const pseudoLocale = ${JSON.stringify(config.pseudo.locale)};`
      : `export const pseudoLocale = undefined;`,
    `/** Single source of truth for createProxy / createNavigation / TongueShell. */`,
    `export const routing = { locales, defaultLocale, prefix };`,
    `export function localeParams() {`,
    `  return locales.map((locale) => ({ locale }));`,
    `}`,
    `let ready = false;`,
    `export function ensureTongue() {`,
    `  if (ready) return;`,
    `  __setServerRuntime({`,
    `    locales: allLocales,`,
    `    defaultLocale,`,
    `    timeZone,`,
    `    rootParams: ${config.routing.rootParams ? 'true' : 'false'},`,
    `    loadNamespace: async (namespace) => {`,
    `      const messages = namespaces[namespace];`,
    `      if (!messages) throw new Error('[next-tongue] Unknown namespace: ' + namespace);`,
    `      return messages;`,
    `    },`,
    `  });`,
    config.pseudo && config.pseudo.enabled !== false
      ? `  configureFormatMessage({ timeZone, pseudo: { locale: ${JSON.stringify(config.pseudo.locale)}, expand: ${config.pseudo.expand} } });`
      : `  configureFormatMessage({ timeZone });`,
    `  ready = true;`,
    `}`,
    // Side-effect: importing `#tongue/runtime` (or getT's lazy import) wires the
    // server without a per-page ensureTongue() call when using withTongue().
    `ensureTongue();`,
    ``,
  );
  await writeFile(join(outDir, 'runtime.js'), runtimeLines.join('\n'), 'utf8');
  await writeFile(
    join(outDir, 'runtime.d.ts'),
    [
      `/** Generated by next-tongue — do not edit. */`,
      `export declare const allLocales: readonly string[];`,
      `export declare const locales: readonly string[];`,
      `export declare const defaultLocale: string;`,
      `export declare const prefix: 'always' | 'as-needed' | 'never';`,
      `export declare const timeZone: string;`,
      `export declare const pseudoLocale: string | undefined;`,
      `export declare const routing: { locales: readonly string[]; defaultLocale: string; prefix: 'always' | 'as-needed' | 'never' };`,
      `export declare function localeParams(): { locale: string }[];`,
      `export declare function ensureTongue(): void;`,
      ``,
    ].join('\n'),
    'utf8',
  );

  // Precomputed Accept-Language lookup tables (#18)
  await writeFile(
    join(outDir, 'locale-matcher.js'),
    emitLocaleMatcherModule(emitLocales),
    'utf8',
  );
  await writeFile(
    join(outDir, 'locale-matcher.d.ts'),
    [
      `/** Generated by next-tongue — do not edit. */`,
      `export declare const exact: Record<string, string>;`,
      `export declare const byLanguage: Record<string, string>;`,
      `export declare const locales: readonly string[];`,
      ``,
    ].join('\n'),
    'utf8',
  );

  const appRoutes = await scanAppRoutes(cwd);
  if (config.routing.pathnames) {
    for (const internal of Object.keys(config.routing.pathnames)) {
      if (appRoutes.length > 0 && !appRoutes.includes(internal)) {
        console.warn(
          `tongue: routing.pathnames key "${internal}" was not found under app/[locale] (known: ${appRoutes.join(', ')})`,
        );
      }
    }
  }

  // Manifest (also consumed by packages/vscode — include message text for hover/previews)
  const manifest = {
    version: 1,
    hash,
    locales: emitLocales,
    defaultLocale: config.defaultLocale,
    timeZone: config.timeZone,
    messages: config.messages,
    pseudo: config.pseudo,
    routes: appRoutes,
    pathnames: config.routing.pathnames ?? {},
    keys: keys.map((k) => {
      const byLocale: Record<string, string> = {};
      for (const locale of emitLocales) {
        const text = catalogs[locale]?.[k.namespace]?.[k.key];
        if (text != null) byLocale[locale] = text;
      }
      return {
        namespace: k.namespace,
        key: k.key,
        fullKey: k.fullKey,
        source: byLocale[config.defaultLocale] ?? '',
        byLocale,
        ...(keyLocations[k.fullKey] != null
          ? { line: keyLocations[k.fullKey], file: defaultMsgRel }
          : {}),
        ...(Object.keys(k.fallbackFrom).length
          ? { fallbackFrom: k.fallbackFrom }
          : {}),
      };
    }),
    fallback: Object.fromEntries(
      emitLocales.map((l) => [
        l,
        resolveFallbackChain(l, config.defaultLocale, config.fallback),
      ]),
    ),
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(join(outDir, '.hash'), hash, 'utf8');

  // package.json imports helper note — apps map "#tongue/*" themselves / via withTongue
  await writeFile(
    join(outDir, 'README.md'),
    'Generated by next-tongue. Do not edit.\nMap package.json `"#tongue/*": "./.tongue/*.js"` (Node needs the .js suffix) and tsconfig paths `"#tongue/*": ["./.tongue/*"]`.\nStatically import `#tongue/runtime` in app/[locale]/layout (e.g. localeParams) so ensureTongue() shares the server module graph with getT.\n',
    'utf8',
  );

  await clearOutputDir(publishedOutDir);
  try {
    await rename(outDir, publishedOutDir);
  } catch (err) {
    throw new TongueError(
      'TONGUE_E_IO',
      `Cannot publish ${publishedOutDir} from staging (${err instanceof Error ? err.message : err}). Delete ${publishedOutDir} and any \`${config.outDir}.tmp-*\` dirs, then re-run tongue build.`,
      { file: publishedOutDir },
    );
  }
  outDir = publishedOutDir;

  return {
    outDir,
    locales: emitLocales,
    namespaces: Object.keys(nsTypes),
    keyCount: keys.length,
    hash,
  };
}

/** Remove a directory tree; on ENOTEMPTY/EBUSY, retry then rename-aside. */
async function clearOutputDir(path: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOTEMPTY' && code !== 'EBUSY' && code !== 'EPERM') {
        if (code === 'ENOENT') return;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 40 * (i + 1)));
    }
  }
  const trash = `${path}.trash-${process.pid}-${Date.now()}`;
  try {
    await rename(path, trash);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw new TongueError(
      'TONGUE_E_IO',
      `Cannot clear ${path} (${err instanceof Error ? err.message : err}). Delete it manually and re-run tongue build.`,
      { file: path },
    );
  }
  void rm(trash, { recursive: true, force: true }).catch(() => {});
}

/** Locales written into message modules / types (includes pseudo when enabled). */
export function localesForEmit(config: ResolvedTongueConfig): readonly string[] {
  if (!config.pseudo || config.pseudo.enabled === false) return config.locales;
  if (config.locales.includes(config.pseudo.locale)) return config.locales;
  return [...config.locales, config.pseudo.locale];
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
    pseudo: config.pseudo,
    devOverlay: config.devOverlay,
  };
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}
