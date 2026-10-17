#!/usr/bin/env node
/**
 * Measure cold tsc --noEmit with/without 10k-key TongueRegister (#6 / ADR 0004).
 *
 * Pass criteria:
 * - Absolute: with-i18n Check time ≤ 2.0s (10k-key registry + 50 typed t() calls)
 * - Relative: if baseline Check time ≥ 0.1s, with-i18n ≤ +15%; otherwise relative
 *   is reported but not gated (sub-100ms noise floor).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)));
const fixture = join(root, 'fixture');
const resultsDir = join(root, '..', 'results');
mkdirSync(resultsDir, { recursive: true });

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

const ABSOLUTE_CHECK_BUDGET_S = 2;
const RELATIVE_FLOOR_S = 0.1;
const RELATIVE_MAX_DELTA = 0.15;
const RUNS = 3;

function runTscOnce(tsconfig) {
  const r = spawnSync(
    process.execPath,
    [tsc, '-p', tsconfig, '--extendedDiagnostics', '--pretty', 'false'],
    { cwd: fixture, encoding: 'utf8' },
  );
  const out = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0) {
    console.error(out);
    throw new Error(`tsc failed for ${tsconfig} (exit ${r.status})`);
  }
  const check = out.match(/Check time:\s*([\d.]+)s/);
  const total = out.match(/Total time:\s*([\d.]+)s/);
  const files = out.match(/Files:\s*(\d+)/);
  return {
    checkSeconds: check ? Number(check[1]) : null,
    totalSeconds: total ? Number(total[1]) : null,
    files: files ? Number(files[1]) : null,
  };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function measure(tsconfig) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(runTscOnce(tsconfig));
  return {
    checkSeconds: median(runs.map((r) => r.checkSeconds)),
    totalSeconds: median(runs.map((r) => r.totalSeconds)),
    files: runs[0].files,
    runs,
  };
}

spawnSync(process.execPath, [join(root, 'generate.mjs')], { stdio: 'inherit' });

const baseline = measure('tsconfig.baseline.json');
const withI18n = measure('tsconfig.with-i18n.json');

const delta =
  baseline.checkSeconds > 0
    ? (withI18n.checkSeconds - baseline.checkSeconds) / baseline.checkSeconds
    : null;

const absoluteOk = withI18n.checkSeconds <= ABSOLUTE_CHECK_BUDGET_S;
const relativeApplies = baseline.checkSeconds >= RELATIVE_FLOOR_S;
const relativeOk = !relativeApplies
  ? null
  : delta != null && delta <= RELATIVE_MAX_DELTA;
const budgetOk = absoluteOk && (relativeOk === null || relativeOk);

const report = {
  measuredAt: new Date().toISOString(),
  keys: 10_000,
  namespaces: 10,
  consumerCalls: 50,
  runs: RUNS,
  baseline: {
    checkSeconds: baseline.checkSeconds,
    totalSeconds: baseline.totalSeconds,
    files: baseline.files,
  },
  withI18n: {
    checkSeconds: withI18n.checkSeconds,
    totalSeconds: withI18n.totalSeconds,
    files: withI18n.files,
  },
  deltaRatio: delta,
  absoluteBudgetSeconds: ABSOLUTE_CHECK_BUDGET_S,
  absoluteOk,
  relativeFloorSeconds: RELATIVE_FLOOR_S,
  relativeMaxDelta: RELATIVE_MAX_DELTA,
  relativeApplies,
  relativeOk,
  budgetOk,
  note:
    'Per-namespace TongueRegister indexing (ADR 0004). Relative +15% gated only when baseline Check ≥ 100ms; absolute Check ≤ 2s always required.',
};

writeFileSync(join(resultsDir, 'tsc-budget.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!budgetOk) {
  console.error('tsc budget FAILED', {
    absoluteOk,
    relativeOk,
    delta,
    withI18n: withI18n.checkSeconds,
  });
  process.exit(1);
}
