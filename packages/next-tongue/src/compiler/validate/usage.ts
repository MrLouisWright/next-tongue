import { readFile } from 'node:fs/promises';
import type { ResolvedTongueConfig, StrictLevel } from '../../config/types.js';
import type { CheckIssue, CheckSeverity } from '../../cli/check-types.js';
import {
  loadLocaleMessages,
  resolveMessagePath,
} from '../load-messages.js';
import { DEFAULT_SCAN_ROOTS, scanKeys } from '../scan-keys.js';
import {
  collectUnusedIgnores,
  isUnusedIgnored,
  matchesUnusedIgnoreGlob,
  type Nested,
} from '../unused-meta.js';

function severityFor(level: StrictLevel, alwaysError = false): CheckSeverity | null {
  if (alwaysError) return 'error';
  if (level === 'off') return null;
  return level === 'error' ? 'error' : 'warn';
}

function namespaceOf(fullKey: string): string {
  const i = fullKey.indexOf('.');
  return i === -1 ? '_root' : fullKey.slice(0, i);
}

/** unused + undefined + undeclared client dynamic checks against scanned source. */
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

  const roots =
    config.scan.include.length > 0 ? config.scan.include : DEFAULT_SCAN_ROOTS;
  const { refs, dynamicNamespaces, undeclaredDynamics } = await scanKeys(
    cwd,
    roots,
  );
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

  for (const site of undeclaredDynamics) {
    issues.push({
      check: 'dynamic',
      severity: 'error',
      message: `useT('${site.namespace}') ${site.name}(variable) is not a string literal — use ${site.name}.dynamic(key, { from: [...] }) so the loader can import keys (plain ${site.name}(var) throws at runtime on the client)`,
      file: site.file,
      line: site.line,
    });
  }

  const unusedSev = severityFor(config.strict.unused);
  if (unusedSev) {
    const ignore = config.strict.unusedIgnore;
    const metaIgnores = await loadUnusedMetaIgnores(config, cwd);
    for (const fullKey of defined) {
      if (used.has(fullKey)) continue;
      if (matchesUnusedIgnoreGlob(fullKey, ignore)) continue;
      if (isUnusedIgnored(fullKey, metaIgnores)) continue;
      // Dynamic t(var) / t.ns / t.dynamic — do not false-flag catalog keys as unused
      if (dynamicNamespaces.has(namespaceOf(fullKey))) continue;
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

async function loadUnusedMetaIgnores(
  config: ResolvedTongueConfig,
  cwd: string,
) {
  const abs = resolveMessagePath(cwd, config.messages, config.defaultLocale);
  try {
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw) as Nested;
    return collectUnusedIgnores(json);
  } catch {
    return collectUnusedIgnores({});
  }
}
