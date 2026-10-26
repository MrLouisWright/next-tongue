/**
 * Spending caps (`cloud.budget`, LOOMLOCALE_MAX_CHARS / LOOMLOCALE_MAX_COST,
 * `--max-chars` / `--max-cost`), checked against the estimate before translating.
 */
import type { CloudBudget, ResolvedTongueConfig } from '../config/types.js';
import { TongueError } from '../errors.js';
import type { Estimate, Plan } from './api.js';

export type Budget = CloudBudget;

function num(v: string | undefined, name: string): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new TongueError('TONGUE_E_CONFIG', `${name} must be a non-negative number (got "${v}")`);
  return n;
}

/** Precedence per field: flag → env → cloud.budget → translate.maxChars (legacy). */
export function resolveBudget(
  config: ResolvedTongueConfig,
  flags: { maxChars?: number; maxCost?: number },
  env: NodeJS.ProcessEnv,
): Budget {
  const b = config.cloud.budget ?? {};
  const out: Budget = {};
  const maxChars = flags.maxChars ?? num(env.LOOMLOCALE_MAX_CHARS, 'LOOMLOCALE_MAX_CHARS') ?? b.maxChars ?? config.translate?.maxChars;
  const maxCost = flags.maxCost ?? num(env.LOOMLOCALE_MAX_COST, 'LOOMLOCALE_MAX_COST') ?? b.maxCostGBP;
  if (maxChars != null) out.maxChars = maxChars;
  if (maxCost != null) out.maxCostGBP = maxCost;
  if (b.monthlyChars != null) out.monthlyChars = b.monthlyChars;
  if (b.monthlyCostGBP != null) out.monthlyCostGBP = b.monthlyCostGBP;
  return out;
}

export function hasBudget(b: Budget): boolean {
  return b.maxChars != null || b.maxCostGBP != null || b.monthlyChars != null || b.monthlyCostGBP != null;
}

const gbp = (n: number) => `£${n.toFixed(2)}`;

/**
 * Throws TONGUE_E_BUDGET (exit 1) when the run would exceed a cap.
 * `estimate.allowed === false` / `withinSpendCap === false` (server-side org cap) also abort.
 */
export function enforceBudget(budget: Budget, est: Pick<Estimate, 'chars' | 'billableChars' | 'costGBP'> & { allowed?: boolean; withinSpendCap?: boolean; note?: string }, plan?: Plan): void {
  const over: string[] = [];
  if (budget.maxChars != null && est.chars > budget.maxChars) over.push(`${est.chars.toLocaleString('en-GB')} chars > max ${budget.maxChars.toLocaleString('en-GB')} per run`);
  if (budget.maxCostGBP != null && est.costGBP > budget.maxCostGBP) over.push(`${gbp(est.costGBP)} > max ${gbp(budget.maxCostGBP)} per run`);
  if (plan && budget.monthlyChars != null && plan.charsUsed + est.chars > budget.monthlyChars) {
    over.push(`${(plan.charsUsed + est.chars).toLocaleString('en-GB')} chars this period > monthly cap ${budget.monthlyChars.toLocaleString('en-GB')}`);
  }
  if (plan && budget.monthlyCostGBP != null) {
    // Prefer the server's figure; fall back to deriving it from charsUsed (PAYG only).
    const spent =
      typeof plan.periodSpendGBP === 'number' ? plan.periodSpendGBP : plan.kind === 'payg' ? (plan.charsUsed / 1_000_000) * plan.paygPerMillionGBP : 0;
    if (spent + est.costGBP > budget.monthlyCostGBP) over.push(`${gbp(spent + est.costGBP)} this period > monthly cap ${gbp(budget.monthlyCostGBP)}`);
  }
  if (est.withinSpendCap === false) over.push(`over your Loomlocale organisation spend cap${est.note ? ` (${est.note})` : ''}`);
  else if (est.allowed === false) over.push(`not allowed by Loomlocale${est.note ? `: ${est.note}` : ''}`);
  if (over.length) {
    throw new TongueError(
      'TONGUE_E_BUDGET',
      `Spending cap exceeded — nothing was translated: ${over.join('; ')}. Raise cloud.budget / --max-chars / --max-cost (or LOOMLOCALE_MAX_CHARS / LOOMLOCALE_MAX_COST), or narrow the run with --locale / --keys.`,
    );
  }
}
