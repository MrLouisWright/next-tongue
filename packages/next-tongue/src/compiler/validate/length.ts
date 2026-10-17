import { readFile } from 'node:fs/promises';
import type { ResolvedTongueConfig, StrictLevel } from '../../config/types.js';
import type { CheckIssue, CheckSeverity } from '../../cli/check-types.js';
import { resolveMessagePath } from '../load-messages.js';

function severityFor(level: StrictLevel): CheckSeverity | null {
  if (level === 'off') return null;
  return level === 'error' ? 'error' : 'warn';
}

type Nested = Record<string, unknown>;

/**
 * Report targets longer than sibling `$meta.maxLength` / `key$description` meta.
 */
export async function validateLength(
  config: ResolvedTongueConfig,
  cwd: string,
  opts?: { locales?: readonly string[] },
): Promise<CheckIssue[]> {
  const sev = severityFor(config.strict.length);
  if (!sev) return [];

  const locales = opts?.locales?.length
    ? opts.locales.filter((l) => config.locales.includes(l))
    : [...config.locales];

  const issues: CheckIssue[] = [];

  for (const locale of locales) {
    const abs = resolveMessagePath(cwd, config.messages, locale);
    let raw: string;
    try {
      raw = await readFile(abs, 'utf8');
    } catch {
      continue;
    }
    let json: Nested;
    try {
      json = JSON.parse(raw) as Nested;
    } catch {
      continue;
    }
    collectLengthIssues(json, '', locale, abs, sev, issues);
  }

  return issues;
}

function collectLengthIssues(
  node: Nested,
  prefix: string,
  locale: string,
  file: string,
  severity: CheckSeverity,
  issues: CheckIssue[],
): void {
  for (const [key, value] of Object.entries(node)) {
    if (key.endsWith('$meta') || key.endsWith('$description') || key === '$meta') {
      continue;
    }
    const full = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      collectLengthIssues(value as Nested, full, locale, file, severity, issues);
      continue;
    }
    if (typeof value !== 'string') continue;

    const metaKey = `${key}$meta`;
    const descKey = `${key}$description`;
    const meta = node[metaKey];
    let maxLength: number | undefined;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const ml = (meta as Nested).maxLength;
      if (typeof ml === 'number') maxLength = ml;
    }
    // $description alone has no maxLength — skip unless $meta provides it.
    void descKey;

    if (maxLength != null && [...value].length > maxLength) {
      issues.push({
        check: 'length',
        severity,
        message: `Target "${full}" in "${locale}" is ${[...value].length} chars (maxLength ${maxLength})`,
        key: full,
        locale,
        file,
      });
    }
  }
}
