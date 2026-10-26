/**
 * `tongue translate` (1.0): one-off machine translation through the
 * Loomlocale API without pull/push. Use `tongue update` for full sync.
 */
import { acceptReviews, runUpdate, type UpdateSummary } from './update.js';
import type { CloudGlobals } from '../cloud/project.js';

export { maskIcu, validateParity, countChars } from '../cloud/engine.js';

export type TranslateCliOptions = CloudGlobals & {
  locale?: string;
  keys?: string;
  dryRun?: boolean;
  yes?: boolean;
  retranslate?: boolean;
  /** true/false override; undefined → CI defaults to review. */
  review?: boolean;
  accept?: boolean;
  /** Billable character budget (overrides config.translate.maxChars). */
  maxChars?: number;
};

export async function cmdTranslate(opts: TranslateCliOptions): Promise<UpdateSummary | number> {
  if (opts.accept) return acceptReviews(opts);
  const env = opts.env ?? process.env;
  const review = opts.review === true || (opts.review === undefined && env.CI === 'true');
  return runUpdate({ ...opts, noSync: true, review });
}
