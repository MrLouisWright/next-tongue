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

/**
 * Since 1.0.6 a lone ' is only an ICU quote right before `{`, `}`, `<` or (inside a
 * plural/selectordinal) `#`. Elsewhere (l'été, don't, d'un {email}) it is a plain
 * apostrophe, so only flag a prose apostrophe — a lone ' preceded by a letter — that
 * sits directly before one of those characters and is never closed, e.g. l'{app} (quotes
 * away {app} and the rest). Closed quotes such as '{'literal'}' or "'<id>'" are deliberate.
 */
export function likelyUnescapedApostrophe(icu: string): boolean {
  return findQuotingApostrophe(icu) !== null;
}

/** Index of the first prose apostrophe that ICU would treat as a quote, or null. */
export function findQuotingApostrophe(icu: string): number | null {
  // Brace stack: 'arg' = inside {…} header, 'plural' / 'body' = inside an option body.
  const stack: Array<'arg' | 'plural' | 'body'> = [];
  const headerStart: number[] = [];
  for (let i = 0; i < icu.length; i++) {
    const ch = icu[i]!;
    if (ch === "'") {
      if (icu[i + 1] === "'") {
        i++;
        continue;
      }
      const next = icu[i + 1];
      const inPlural = stack.includes('plural');
      const quotes = next === '{' || next === '}' || next === '<' || (next === '#' && inPlural);
      if (quotes) {
        let j = i + 1;
        for (; j < icu.length; j++) {
          if (icu[j] === "'") {
            if (icu[j + 1] === "'") j++;
            else break;
          }
        }
        // A prose apostrophe (after a letter) with no closing ' swallows the rest of the message.
        if (j >= icu.length && i > 0 && /\p{L}/u.test(icu[i - 1]!)) return i;
        // Otherwise a deliberate quoted literal ('{literal}'): skip to the closing '.
        i = j;
      }
      continue;
    }
    if (ch === '{') {
      const top = stack[stack.length - 1];
      if (top === 'arg') {
        const header = icu.slice(headerStart[headerStart.length - 1]!, i);
        stack.push(/^\s*[\w$.]+\s*,\s*(plural|selectordinal)\s*,/.test(header) ? 'plural' : 'body');
      } else {
        stack.push('arg');
        headerStart.push(i + 1);
      }
    } else if (ch === '}') {
      const top = stack.pop();
      if (top === 'arg') headerStart.pop();
    }
  }
  return null;
}

/** Apostrophe hints now apply to every locale (the narrow rule no longer floods on don't / l'été). */
export function shouldHintApostrophe(_locale: string, _source?: string): boolean {
  return true;
}

export function apostropheHintMessage(fullKey: string, source: string): string {
  const at = findQuotingApostrophe(source);
  const snippet = at === null ? null : source.slice(Math.max(0, at - 1), Math.min(source.length, at + 6));
  const fix = snippet ? ` ("${snippet}" → "${snippet.replace("'", "''")}")` : '';
  return `Key "${fullKey}" has a single ' directly before {, }, < or # (in a plural), which ICU reads as a quote and hides what follows. Double it if you meant an apostrophe: l'{app} → l''{app}${fix}.`;
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
      `\n  Hint: default locale may have a single ' right before {…} (e.g. l'{app} → l''{app}) that quoted the placeholder away.`;
  }
  return msg;
}
