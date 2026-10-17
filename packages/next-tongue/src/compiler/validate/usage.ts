import type { ResolvedTongueConfig, StrictLevel } from '../../config/types.js';
import type { CheckIssue, CheckSeverity } from '../../cli/check-types.js';
import { loadLocaleMessages } from '../load-messages.js';
import { scanReferencedKeys } from '../scan-keys.js';

function severityFor(level: StrictLevel, alwaysError = false): CheckSeverity | null {
  if (alwaysError) return 'error';
  if (level === 'off') return null;
  return level === 'error' ? 'error' : 'warn';
}

/** unused + undefined checks against scanned source references. */
export async function validateUsage(
  config: ResolvedTongueConfig,
  cwd: string,
): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCatalog = catalogs[config.defaultLocale];
  if (!defaultCatalog) return issues;

  const defined = new Set<string>();
  for (const [ns, msgs] of Object.entries(defaultCatalog)) {
    for (const key of Object.keys(msgs)) {
      defined.add(ns === '_root' ? key : `${ns}.${key}`);
    }
  }

  const refs = await scanReferencedKeys(cwd);
  const used = new Set<string>();
  for (const ref of refs) {
    used.add(ref.fullKey);
    if (!defined.has(ref.fullKey)) {
      issues.push({
        check: 'undefined',
        severity: 'error',
        message: `Key "${ref.fullKey}" referenced in code but absent from default locale`,
        key: ref.fullKey,
        file: ref.file,
        line: ref.line,
      });
    }
  }

  const unusedSev = severityFor(config.strict.unused);
  if (unusedSev) {
    for (const fullKey of defined) {
      if (used.has(fullKey)) continue;
      issues.push({
        check: 'unused',
        severity: unusedSev,
        message: `Key "${fullKey}" is never referenced in source`,
        key: fullKey,
        file: config.messages.replaceAll('{locale}', config.defaultLocale),
      });
    }
  }

  return issues;
}
