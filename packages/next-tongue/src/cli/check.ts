import { loadConfig } from '../config/load-config.js';
import { validateCatalog, validateStale } from '../compiler/validate/catalog.js';
import { validateUsage } from '../compiler/validate/usage.js';
import { validateA11y } from '../compiler/validate/a11y.js';
import { validateBidi } from '../compiler/validate/bidi.js';
import { loadLocaleMessages } from '../compiler/load-messages.js';
import {
  duplicateSourceKeys,
  loadAndMergeSources,
} from '../compiler/sources.js';
import {
  reportGithub,
  reportJson,
  reportPretty,
  summarize,
} from './reporters.js';
import type { CheckIssue } from './check-types.js';

export type CheckCliOptions = {
  cwd?: string;
  config?: string;
  locale?: string;
  reporter?: 'pretty' | 'json' | 'github';
  maxWarnings?: number;
  quiet?: boolean;
};

export async function cmdCheck(opts: CheckCliOptions): Promise<void> {
  const { config, cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });

  const localeFilter = opts.locale
    ? opts.locale.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const issues: CheckIssue[] = [];
  issues.push(
    ...(await validateCatalog(config, cwd, {
      ...(localeFilter ? { locales: localeFilter } : {}),
    })),
  );
  issues.push(...(await validateUsage(config, cwd)));
  issues.push(
    ...(await validateStale(config, cwd, {
      ...(localeFilter ? { locales: localeFilter } : {}),
    })),
  );
  issues.push(...(await validateA11y(config, cwd)));
  issues.push(
    ...(await validateBidi(config, cwd, {
      ...(localeFilter ? { locales: localeFilter } : {}),
    })),
  );

  if (config.sources.length) {
    const fileCatalogs = await loadLocaleMessages(config, cwd);
    const { origins } = await loadAndMergeSources(config, cwd, fileCatalogs);
    for (const fullKey of duplicateSourceKeys(origins)) {
      issues.push({
        check: 'duplicate',
        severity: 'warn',
        message: `Key "${fullKey}" is defined in more than one place (file and/or sources)`,
        key: fullKey,
      });
    }
  }

  const result = summarize(issues);
  const reporter = opts.reporter ?? 'pretty';
  if (!opts.quiet || reporter === 'json' || reporter === 'github') {
    if (reporter === 'json') reportJson(result);
    else if (reporter === 'github') reportGithub(result);
    else reportPretty(result);
  }

  const maxWarnings = opts.maxWarnings ?? Number.POSITIVE_INFINITY;
  if (result.errorCount > 0 || result.warningCount > maxWarnings) {
    process.exitCode = 1;
  }
}
