import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ResolvedTongueConfig, StrictLevel } from '../../config/types.js';
import type { CheckIssue, CheckSeverity } from '../../cli/check-types.js';
import { collectArgs, type MessageAst } from '../ast.js';
import { parseMessage } from '../parse/icu-parser.js';
import { loadLocaleMessages, resolveMessagePath } from '../load-messages.js';
import { resolveFallbackChain } from '../fallback.js';
import { checkPluralCategories } from './plurals.js';
import { locateMessageKeys } from '../json-locations.js';
import { TongueError } from '../../errors.js';

function severityFor(level: StrictLevel, alwaysError = false): CheckSeverity | null {
  if (alwaysError) return 'error';
  if (level === 'off') return null;
  return level === 'error' ? 'error' : 'warn';
}

/**
 * Catalog-only checks: syntax, missing, mismatch (ICU args / plural categories).
 */
export async function validateCatalog(
  config: ResolvedTongueConfig,
  cwd: string,
  opts?: { locales?: readonly string[] },
): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCatalog = catalogs[config.defaultLocale];
  if (!defaultCatalog) {
    issues.push({
      check: 'missing',
      severity: 'error',
      message: `Default locale "${config.defaultLocale}" has no messages`,
    });
    return issues;
  }

  const locales = opts?.locales?.length
    ? opts.locales.filter((l) => config.locales.includes(l))
    : [...config.locales];

  const defaultMsgRel = config.messages.replaceAll(
    '{locale}',
    config.defaultLocale,
  );
  let defaultLocs: Record<string, number> = {};
  try {
    const raw = await readFile(
      resolveMessagePath(cwd, config.messages, config.defaultLocale),
      'utf8',
    );
    const flatKeys: string[] = [];
    for (const [ns, msgs] of Object.entries(defaultCatalog)) {
      for (const key of Object.keys(msgs)) {
        flatKeys.push(ns === '_root' ? key : `${ns}.${key}`);
      }
    }
    defaultLocs = locateMessageKeys(raw, flatKeys);
  } catch {
    /* optional */
  }

  for (const [ns, messages] of Object.entries(defaultCatalog)) {
    for (const [key, source] of Object.entries(messages)) {
      const fullKey = ns === '_root' ? key : `${ns}.${key}`;
      const file = defaultMsgRel;
      const line = defaultLocs[fullKey];

      let defaultAst: MessageAst;
      try {
        defaultAst = parseMessage(source, { file, key: fullKey });
      } catch (err) {
        issues.push({
          check: 'syntax',
          severity: 'error',
          message: err instanceof Error ? err.message : String(err),
          key: fullKey,
          locale: config.defaultLocale,
          file,
          ...(line != null ? { line } : {}),
        });
        continue;
      }
      if (
        shouldHintApostrophe(config.defaultLocale, source) &&
        likelyUnescapedApostrophe(source)
      ) {
        issues.push({
          check: 'icu',
          severity: 'warn',
          message: apostropheHintMessage(fullKey, source),
          key: fullKey,
          locale: config.defaultLocale,
          file,
          ...(line != null ? { line } : {}),
        });
      }
      const defaultArgs = collectArgs(defaultAst);

      for (const locale of locales) {
        if (locale === config.defaultLocale) continue;
        const localeFile = config.messages.replaceAll('{locale}', locale);
        const chain = resolveFallbackChain(
          locale,
          config.defaultLocale,
          config.fallback,
        );
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
          const sev = severityFor(config.strict.missing);
          if (sev) {
            issues.push({
              check: 'missing',
              severity: sev,
              message: `Key "${fullKey}" missing in locale "${locale}"`,
              key: fullKey,
              locale,
              file: localeFile,
            });
          }
          continue;
        }

        // Also flag when the locale file itself lacks the key (filled via fallback).
        if (resolvedLocale !== locale) {
          const sev = severityFor(config.strict.missing);
          if (sev) {
            issues.push({
              check: 'missing',
              severity: sev,
              message: `Key "${fullKey}" missing in locale "${locale}" (falls back to "${resolvedLocale}")`,
              key: fullKey,
              locale,
              file: localeFile,
            });
          }
        }

        let otherAst: MessageAst;
        try {
          otherAst = parseMessage(resolved, {
            file: localeFile,
            key: fullKey,
          });
        } catch (err) {
          issues.push({
            check: 'syntax',
            severity: 'error',
            message: err instanceof Error ? err.message : String(err),
            key: fullKey,
            locale,
            file: localeFile,
          });
          continue;
        }

        if (
          shouldHintApostrophe(locale, resolved) &&
          likelyUnescapedApostrophe(resolved)
        ) {
          issues.push({
            check: 'icu',
            severity: 'warn',
            message: apostropheHintMessage(fullKey, resolved),
            key: fullKey,
            locale,
            file: localeFile,
          });
        }

        const mismatchSev = severityFor(config.strict.mismatch);
        if (mismatchSev) {
          const otherArgs = collectArgs(otherAst);
          const missingArgs = Object.keys(defaultArgs).filter(
            (a) => !(a in otherArgs),
          );
          const extraArgs = Object.keys(otherArgs).filter(
            (a) => !(a in defaultArgs),
          );
          if (missingArgs.length || extraArgs.length) {
            issues.push({
              check: 'mismatch',
              severity: mismatchSev,
              message: formatArgMismatch({
                fullKey,
                locale,
                defaultLocale: config.defaultLocale,
                defaultSource: source,
                otherSource: resolved,
                defaultArgs: Object.keys(defaultArgs),
                otherArgs: Object.keys(otherArgs),
                missingArgs,
                extraArgs,
              }),
              key: fullKey,
              locale,
              file: localeFile,
            });
          }
          for (const issue of checkPluralCategories(otherAst, locale)) {
            if (issue.kind !== 'extra-category') continue;
            issues.push({
              check: 'mismatch',
              severity: mismatchSev,
              message: `Locale "${locale}" uses plural category "${issue.category}" which CLDR does not define (${fullKey})`,
              key: fullKey,
              locale,
              file: localeFile,
            });
          }
        }
      }
    }
  }

  return issues;
}

export type LockEntry = {
  source: string;
  target?: string;
  model?: string;
  at?: string;
};

export type TongueLock = {
  version: number;
  [locale: string]: Record<string, LockEntry> | number;
};

function sourceHash(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/** Compare default-locale source hashes in `tongue.lock` against current messages. */
export async function validateStale(
  config: ResolvedTongueConfig,
  cwd: string,
  opts?: { locales?: readonly string[] },
): Promise<CheckIssue[]> {
  const sev = severityFor(config.strict.stale);
  if (!sev) return [];

  const lockPath = config.translate?.lockfile ?? './tongue.lock';
  const abs = resolve(cwd, lockPath);

  let raw: string;
  try {
    raw = await readFile(abs, 'utf8');
  } catch {
    return []; // no lockfile → nothing stale
  }

  let lock: TongueLock;
  try {
    lock = JSON.parse(raw) as TongueLock;
  } catch (err) {
    throw new TongueError(
      'TONGUE_E_PARSE',
      `Invalid tongue.lock: ${err instanceof Error ? err.message : err}`,
      { file: abs },
    );
  }

  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCatalog = catalogs[config.defaultLocale];
  if (!defaultCatalog) return [];

  const locales = opts?.locales?.length
    ? opts.locales.filter((l) => l !== config.defaultLocale && config.locales.includes(l))
    : config.locales.filter((l) => l !== config.defaultLocale);

  const issues: CheckIssue[] = [];
  for (const locale of locales) {
    const section = lock[locale];
    if (!section || typeof section === 'number') continue;
    for (const [fullKey, entry] of Object.entries(section)) {
      if (!entry?.source) continue;
      const dot = fullKey.indexOf('.');
      const ns = dot === -1 ? '_root' : fullKey.slice(0, dot);
      const key = dot === -1 ? fullKey : fullKey.slice(dot + 1);
      const source = defaultCatalog[ns]?.[key];
      if (source == null) continue;
      const current = sourceHash(source);
      if (current !== entry.source) {
        issues.push({
          check: 'stale',
          severity: sev,
          message: `Source for "${fullKey}" changed since "${locale}" was translated`,
          key: fullKey,
          locale,
          file: lockPath,
        });
      }
    }
  }
  return issues;
}

/** Letter + single quote + letter — usually meant as prose apostrophe, not ICU quote. */
export function likelyUnescapedApostrophe(icu: string): boolean {
  for (let i = 0; i < icu.length - 2; i++) {
    const a = icu[i]!;
    const b = icu[i + 1]!;
    const c = icu[i + 2]!;
    if (b === "'" && /[A-Za-zÀ-ÿ]/.test(a) && /[A-Za-zÀ-ÿ]/.test(c)) {
      return true;
    }
  }
  return false;
}

/**
 * Apostrophe-in-words is common in fr/it/…; English `don't` alone floods CI.
 * Still warn for English when the message also has `{…}` placeholders — a prose
 * apostrophe (couldn't) quotes away the rest of the string so args vanish.
 */
export function shouldHintApostrophe(
  locale: string,
  source?: string,
): boolean {
  if (/^(fr|it|ca|oc|ht|lb|rm|ga|gd|mt)(-|$)/i.test(locale)) return true;
  if (
    /^(en)(-|$)/i.test(locale) &&
    source != null &&
    /\{[A-Za-z_$]/.test(source) &&
    likelyUnescapedApostrophe(source)
  ) {
    return true;
  }
  return false;
}

export function apostropheHintMessage(fullKey: string, source: string): string {
  const hasArgs = /\{[A-Za-z_$]/.test(source);
  const base = `Key "${fullKey}" looks like a natural-language apostrophe. In ICU, double it: "couldn''t" / "l''été".`;
  if (hasArgs) {
    return `${base} A single ' before a letter quotes until the next ', which can swallow {placeholders} so the default locale looks like it has no args.`;
  }
  return base;
}

export function formatArgMismatch(opts: {
  fullKey: string;
  locale: string;
  defaultLocale: string;
  defaultSource: string;
  otherSource: string;
  defaultArgs: string[];
  otherArgs: string[];
  missingArgs: string[];
  extraArgs: string[];
}): string {
  const {
    fullKey,
    locale,
    defaultLocale,
    defaultSource,
    otherSource,
    defaultArgs,
    otherArgs,
    missingArgs,
    extraArgs,
  } = opts;
  const clip = (s: string) =>
    s.length > 120 ? `${s.slice(0, 117)}…` : s;
  let msg =
    `ICU arg mismatch for "${fullKey}" in "${locale}": ` +
    `missing=[${missingArgs}] extra=[${extraArgs}]\n` +
    `  ${defaultLocale} args=[${defaultArgs}] ${JSON.stringify(clip(defaultSource))}\n` +
    `  ${locale} args=[${otherArgs}] ${JSON.stringify(clip(otherSource))}`;
  if (
    defaultArgs.length === 0 &&
    otherArgs.length > 0 &&
    likelyUnescapedApostrophe(defaultSource)
  ) {
    msg +=
      `\n  Hint: default locale may have an unescaped apostrophe (e.g. couldn't → couldn''t) that quoted away {…}.`;
  }
  return msg;
}
