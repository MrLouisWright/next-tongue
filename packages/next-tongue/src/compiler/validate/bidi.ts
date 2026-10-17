import type { ResolvedTongueConfig, StrictLevel } from '../../config/types.js';
import type { CheckIssue, CheckSeverity } from '../../cli/check-types.js';
import { loadLocaleMessages } from '../load-messages.js';
import { getDir } from '../../runtime/locale.js';

const LRE = '\u202A';
const RLE = '\u202B';
const PDF = '\u202C';
const LRI = '\u2066';
const RLI = '\u2067';
const FSI = '\u2068';
const PDI = '\u2069';

const ISOLATE_OPEN = new Set([LRI, RLI, FSI]);
const EMBED_OPEN = new Set([LRE, RLE]);

function severityFor(level: StrictLevel): CheckSeverity | null {
  if (level === 'off') return null;
  return level === 'error' ? 'error' : 'warn';
}

/**
 * Bidi hygiene for RTL (and mixed) message strings.
 */
export async function validateBidi(
  config: ResolvedTongueConfig,
  cwd: string,
  opts?: { locales?: readonly string[] },
): Promise<CheckIssue[]> {
  const sev = severityFor(config.strict.bidi);
  if (!sev) return [];

  const catalogs = await loadLocaleMessages(config, cwd);
  const locales = opts?.locales?.length
    ? opts.locales.filter((l) => config.locales.includes(l))
    : [...config.locales];

  const issues: CheckIssue[] = [];

  for (const locale of locales) {
    const catalog = catalogs[locale];
    if (!catalog) continue;
    const rtl = getDir(locale) === 'rtl';
    for (const [ns, msgs] of Object.entries(catalog)) {
      for (const [key, text] of Object.entries(msgs)) {
        const fullKey = ns === '_root' ? key : `${ns}.${key}`;
        const file = config.messages.replaceAll('{locale}', locale);
        issues.push(
          ...checkMessageBidi(text, {
            fullKey,
            locale,
            file,
            rtl,
            severity: sev,
          }),
        );
      }
    }
  }

  return issues;
}

export function checkMessageBidi(
  text: string,
  ctx: {
    fullKey: string;
    locale: string;
    file: string;
    rtl: boolean;
    severity: CheckSeverity;
  },
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const { fullKey, locale, file, rtl, severity } = ctx;

  let embed = 0;
  let isolate = 0;
  for (const ch of text) {
    if (EMBED_OPEN.has(ch)) embed++;
    else if (ch === PDF) embed = Math.max(0, embed - 1);
    else if (ISOLATE_OPEN.has(ch)) isolate++;
    else if (ch === PDI) isolate = Math.max(0, isolate - 1);
  }
  if (embed !== 0 || isolate !== 0) {
    issues.push({
      check: 'bidi',
      severity,
      message: `Unbalanced bidi controls in "${fullKey}" (${locale})`,
      key: fullKey,
      locale,
      file,
    });
  }

  if (!rtl) return issues;

  // Args that look like they need isolation: {name} not wrapped in FSI…PDI
  // and adjacent to strong LTR punctuation.
  const argRe = /\{([A-Za-z_][\w]*|#)(?:,[^}]*)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = argRe.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const before = text.slice(Math.max(0, start - 2), start);
    const after = text.slice(end, end + 2);
    const surrounded =
      text.slice(Math.max(0, start - 1), start) === FSI &&
      text.slice(end, end + 1) === PDI;
    const ltrPunct = /[()[\]{}<>«»""''%]/.test(before + after);
    if (ltrPunct && !surrounded) {
      issues.push({
        check: 'bidi',
        severity,
        message: `RTL message "${fullKey}" has LTR punctuation around {${m[1]}} — wrap the arg in U+2068…U+2069 (FSI/PDI)`,
        key: fullKey,
        locale,
        file,
      });
    }
  }

  return issues;
}
