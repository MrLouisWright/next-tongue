import { parseArgs } from 'node:util';
import { loadConfig } from '../config/load-config.js';
import { buildMessages } from '../compiler/build.js';
import { TongueError } from '../errors.js';
import { cmdCheck } from './check.js';
import { cmdExtract } from './extract.js';
import { cmdInit } from './init.js';
import { cmdExport, cmdImport } from './export-import.js';
import { cmdReport, parseMaxBytes } from './report.js';
import { cmdTranslate } from './translate.js';
import { runUpdate } from './update.js';
import { runWizard } from './wizard.js';
import { cmdLink, cmdLogin, cmdLogout, cmdPull, cmdPush, cmdStatus, cmdWhoami } from './cloud.js';
import { ApiError } from '../cloud/api.js';
import type { CloudGlobals } from '../cloud/project.js';
import { cmdMigrate } from './migrate.js';

export async function runCli(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      cwd: { type: 'string' },
      config: { type: 'string' },
      json: { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      watch: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      locale: { type: 'string' },
      reporter: { type: 'string' },
      'max-warnings': { type: 'string' },
      include: { type: 'string' },
      placeholder: { type: 'string' },
      prune: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      'dry-run': { type: 'boolean', default: false },
      locales: { type: 'string' },
      default: { type: 'string' },
      prefix: { type: 'string' },
      export: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      proxy: { type: 'string' },
      format: { type: 'string' },
      out: { type: 'string' },
      'missing-only': { type: 'boolean', default: false },
      'max-bytes': { type: 'string' },
      keys: { type: 'string' },
      retranslate: { type: 'boolean', default: false },
      // No default: undefined = not passed (CI defaults to review).
      review: { type: 'boolean' },
      accept: { type: 'boolean', default: false },
      'max-chars': { type: 'string' },
      'max-cost': { type: 'string' },
      concurrency: { type: 'string' },
      'out-dir': { type: 'string' },
      'base-url': { type: 'string' },
      ci: { type: 'boolean', default: false },
      prefer: { type: 'string' },
      project: { type: 'string' },
      create: { type: 'string' },
      'no-browser': { type: 'boolean', default: false },
      wizard: { type: 'boolean', default: false },
      scaffold: { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const command = positionals[0];

  if (values.version && !command) {
    console.log(await readVersion());
    return;
  }
  const g: CloudGlobals = {
    ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
    ...(typeof values.config === 'string' ? { config: values.config } : {}),
    ...(typeof values['base-url'] === 'string' ? { baseURL: values['base-url'] } : {}),
    json: values.json === true,
    quiet: values.quiet === true,
  };
  const preferRaw = typeof values.prefer === 'string' ? values.prefer : undefined;
  if (preferRaw != null && preferRaw !== 'local' && preferRaw !== 'remote') {
    console.error(`Invalid --prefer ${JSON.stringify(preferRaw)} (expected local|remote)`);
    process.exitCode = 2;
    return;
  }
  const prefer = preferRaw as 'local' | 'remote' | undefined;
  const maxChars =
    typeof values['max-chars'] === 'string' ? Number(values['max-chars']) : undefined;
  if (maxChars != null && !(Number.isFinite(maxChars) && maxChars >= 0)) {
    console.error('`--max-chars` must be a non-negative number');
    process.exitCode = 2;
    return;
  }
  const maxCost =
    typeof values['max-cost'] === 'string' ? Number(String(values['max-cost']).replace(/^£/, '')) : undefined;
  if (maxCost != null && !(Number.isFinite(maxCost) && maxCost >= 0)) {
    console.error('`--max-cost` must be a non-negative number (GBP)');
    process.exitCode = 2;
    return;
  }
  const concurrency = typeof values.concurrency === 'string' ? Number(values.concurrency) : undefined;
  if (concurrency != null && !(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 32)) {
    console.error('`--concurrency` must be an integer from 1 to 32');
    process.exitCode = 2;
    return;
  }
  // `--review pr` / `--review=pr`: review via pull request (update only).
  const reviewPr = values.review === 'pr' || (values.review === true && positionals[1] === 'pr');
  const runExtras = {
    ...(maxCost != null ? { maxCost } : {}),
    ...(concurrency != null ? { concurrency } : {}),
    ...(typeof values['out-dir'] === 'string' ? { outDir: values['out-dir'] } : {}),
  };
  const interactive =
    values.wizard === true || (process.stdin.isTTY === true && process.stdout.isTTY === true);

  if (!command && !values.help && interactive) {
    await runWizard({ ...g, noBrowser: values['no-browser'] === true });
    return;
  }

  if (!command || values.help) {
    printHelp();
    // --help/-h is a successful request; only a bare `tongue` is a usage error.
    if (!command && !values.help) process.exitCode = 2;
    return;
  }

  try {
    switch (command) {
      case 'build':
        await cmdBuild({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.config === 'string' ? { config: values.config } : {}),
          json: values.json === true,
          quiet: values.quiet === true,
        });
        break;
      case 'check': {
        const reporterRaw =
          typeof values.reporter === 'string' ? values.reporter : undefined;
        const reporter =
          reporterRaw === 'json' ||
          reporterRaw === 'github' ||
          reporterRaw === 'pretty'
            ? reporterRaw
            : values.json === true
              ? 'json'
              : 'pretty';
        if (
          reporterRaw != null &&
          reporterRaw !== 'pretty' &&
          reporterRaw !== 'json' &&
          reporterRaw !== 'github'
        ) {
          console.error(
            `Invalid --reporter ${JSON.stringify(reporterRaw)} (expected pretty|json|github)`,
          );
          process.exitCode = 2;
          break;
        }
        let maxWarnings: number | undefined;
        if (typeof values['max-warnings'] === 'string') {
          const n = Number(values['max-warnings']);
          if (!Number.isFinite(n) || n < 0) {
            console.error('`--max-warnings` must be a non-negative number');
            process.exitCode = 2;
            break;
          }
          maxWarnings = n;
        }
        await cmdCheck({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.config === 'string' ? { config: values.config } : {}),
          ...(typeof values.locale === 'string' ? { locale: values.locale } : {}),
          reporter,
          ...(maxWarnings != null ? { maxWarnings } : {}),
          quiet: values.quiet === true,
        });
        break;
      }
      case 'init': {
        const scaffoldFlags =
          values.scaffold === true ||
          values.yes === true ||
          values['dry-run'] === true ||
          typeof values.locales === 'string' ||
          typeof values.prefix === 'string' ||
          typeof values.proxy === 'string' ||
          values.export === true;
        if (!scaffoldFlags && interactive) {
          await runWizard({ ...g, noBrowser: values['no-browser'] === true });
          break;
        }
        const prefixRaw =
          typeof values.prefix === 'string' ? values.prefix : undefined;
        const prefix =
          prefixRaw === 'always' ||
          prefixRaw === 'as-needed' ||
          prefixRaw === 'never'
            ? prefixRaw
            : undefined;
        if (
          prefixRaw != null &&
          prefixRaw !== 'always' &&
          prefixRaw !== 'as-needed' &&
          prefixRaw !== 'never'
        ) {
          console.error(
            `Invalid --prefix ${JSON.stringify(prefixRaw)} (expected always|as-needed|never)`,
          );
          process.exitCode = 2;
          break;
        }
        const proxyRaw =
          typeof values.proxy === 'string' ? values.proxy : undefined;
        const proxyMode =
          proxyRaw === 'merge' ||
          proxyRaw === 'skip' ||
          proxyRaw === 'overwrite'
            ? proxyRaw
            : undefined;
        if (
          proxyRaw != null &&
          proxyRaw !== 'merge' &&
          proxyRaw !== 'skip' &&
          proxyRaw !== 'overwrite'
        ) {
          console.error(
            `Invalid --proxy ${JSON.stringify(proxyRaw)} (expected merge|skip|overwrite)`,
          );
          process.exitCode = 2;
          break;
        }
        await cmdInit({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.locales === 'string' ? { locales: values.locales } : {}),
          ...(typeof values.default === 'string' ? { default: values.default } : {}),
          ...(prefix ? { prefix } : {}),
          ...(proxyMode ? { proxyMode } : {}),
          export: values.export === true,
          yes: values.yes === true,
          force: values.force === true,
          dryRun: values['dry-run'] === true,
          quiet: values.quiet === true,
        });
        break;
      }
      case 'extract':
        await cmdExtract({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.config === 'string' ? { config: values.config } : {}),
          ...(typeof values.include === 'string' ? { include: values.include } : {}),
          ...(typeof values.placeholder === 'string'
            ? { placeholder: values.placeholder }
            : {}),
          prune: values.prune === true,
          yes: values.yes === true,
          dryRun: values['dry-run'] === true,
          json: values.json === true,
          quiet: values.quiet === true,
        });
        break;
      case 'export': {
        const formatRaw =
          typeof values.format === 'string' ? values.format : 'xliff';
        if (formatRaw !== 'xliff' && formatRaw !== 'csv') {
          console.error(`Invalid --format ${JSON.stringify(formatRaw)} (xliff|csv)`);
          process.exitCode = 2;
          break;
        }
        await cmdExport({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.config === 'string' ? { config: values.config } : {}),
          format: formatRaw,
          ...(typeof values.locale === 'string' ? { locale: values.locale } : {}),
          ...(typeof values.out === 'string' ? { out: values.out } : {}),
          missingOnly: values['missing-only'] === true,
          quiet: values.quiet === true,
        });
        break;
      }
      case 'import': {
        const file = positionals[1];
        if (!file) {
          console.error('Usage: tongue import <file.xlf|file.csv>');
          process.exitCode = 2;
          break;
        }
        await cmdImport({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.config === 'string' ? { config: values.config } : {}),
          file,
          dryRun: values['dry-run'] === true,
          quiet: values.quiet === true,
        });
        break;
      }
      case 'report': {
        let maxBytes: number | undefined;
        if (typeof values['max-bytes'] === 'string') {
          try {
            maxBytes = parseMaxBytes(values['max-bytes']);
          } catch (err) {
            console.error(err instanceof Error ? err.message : err);
            process.exitCode = 2;
            break;
          }
        }
        await cmdReport({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          ...(typeof values.config === 'string' ? { config: values.config } : {}),
          json: values.json === true,
          ...(maxBytes != null ? { maxBytes } : {}),
          quiet: values.quiet === true,
        });
        break;
      }
      case 'translate':
        await cmdTranslate({
          ...g,
          ...(typeof values.locale === 'string' ? { locale: values.locale } : {}),
          ...(typeof values.keys === 'string' ? { keys: values.keys } : {}),
          dryRun: values['dry-run'] === true,
          yes: values.yes === true,
          retranslate: values.retranslate === true,
          ...(values.review === true
            ? { review: true }
            : values.review === false
              ? { review: false }
              : {}),
          accept: values.accept === true,
          ...(maxChars != null ? { maxChars } : {}),
          ...runExtras,
        });
        break;
      case 'update':
        await runUpdate({
          ...g,
          ...(typeof values.locale === 'string' ? { locale: values.locale } : {}),
          ...(typeof values.keys === 'string' ? { keys: values.keys } : {}),
          dryRun: values['dry-run'] === true,
          ci: values.ci === true,
          yes: values.yes === true,
          retranslate: values.retranslate === true,
          ...(prefer ? { prefer } : {}),
          ...(maxChars != null ? { maxChars } : {}),
          ...runExtras,
          ...(reviewPr ? { reviewMode: 'pr' as const } : {}),
        });
        break;
      case 'login':
        await cmdLogin({ ...g, noBrowser: values['no-browser'] === true });
        break;
      case 'logout':
        await cmdLogout(g);
        break;
      case 'whoami':
        await cmdWhoami(g);
        break;
      case 'link':
        await cmdLink({
          ...g,
          ...(typeof values.project === 'string' ? { project: values.project } : {}),
          ...(typeof values.create === 'string' ? { create: values.create } : {}),
        });
        break;
      case 'status':
        await cmdStatus(g);
        break;
      case 'push':
        await cmdPush(g);
        break;
      case 'pull':
        await cmdPull({ ...g, ...(prefer ? { prefer } : {}), dryRun: values['dry-run'] === true });
        break;
      case 'migrate': {
        const from = positionals[1] ?? 'next-intl';
        await cmdMigrate({
          ...(typeof values.cwd === 'string' ? { cwd: values.cwd } : {}),
          from,
          dryRun: values['dry-run'] === true,
          quiet: values.quiet === true,
          json: values.json === true,
          ...(typeof values.out === 'string' ? { report: values.out } : {}),
        });
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 2;
    }
  } catch (err) {
    if (err instanceof TongueError) {
      console.error(`${err.code}: ${err.message}`);
      process.exitCode = err.code === 'TONGUE_E_CONFIG' ? 2 : 1;
      return;
    }
    if (err instanceof ApiError) {
      console.error(`TONGUE_E_API: ${err.message}`);
      // 4 = insufficient prepaid credit (top up and re-run); other API errors 1.
      process.exitCode = err.status === 402 && err.code === 'insufficient_credit' ? 4 : 1;
      return;
    }
    throw err;
  }
}

async function cmdBuild(opts: {
  cwd?: string;
  config?: string;
  json?: boolean;
  quiet?: boolean;
}): Promise<void> {
  const { config, cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });
  const result = await buildMessages({ config, cwd });
  if (opts.json) {
    console.log(JSON.stringify(result));
  } else if (!opts.quiet) {
    console.log(
      `tongue build: ${result.keyCount} keys, ${result.locales.length} locales → ${result.outDir} (${result.hash})`,
    );
  }
}

async function readVersion(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

function printHelp(): void {
  console.log(`next-tongue CLI

Usage:
  tongue build [--cwd <dir>] [--config <path>] [--json] [--quiet]
  tongue check [--cwd <dir>] [--config <path>] [--locale de] [--reporter pretty|json|github] [--max-warnings N]
  tongue extract [--include app,src] [--placeholder ''] [--prune] [--yes] [--dry-run]
  tongue init [--locales en,de] [--default en] [--prefix as-needed] [--proxy merge|skip|overwrite] [--export] [--yes] [--force] [--dry-run]
  tongue export --format xliff|csv [--locale de] [--out ./translations] [--missing-only]
  tongue import <file.xlf|file.csv> [--dry-run]
  tongue report [--json] [--max-bytes 4kb]
  tongue translate [--locale de] [--keys 'home.*'] [--dry-run] [--review] [--accept] [--retranslate] [--max-chars N]

Loomlocale (hosted translation; npx next-tongue = guided setup):
  tongue init                       interactive wizard (use --scaffold/--yes for file scaffolding only)
  tongue login [--no-browser]       device-code login; token in OS keychain (fallback ~/.config/loomlocale)
  tongue init --wizard              run the guided wizard even without a TTY (answers read line-by-line from stdin)
  tongue logout | whoami [--json]
  tongue link [--project <id|name>] [--create <name>]
  tongue update [--dry-run] [--ci] [--yes] [--prefer local|remote] [--locale de] [--keys 'home.*']
                [--max-chars N] [--max-cost GBP] [--concurrency N] [--review pr] [--out-dir DIR] [--json]
                pull web edits → translate new/changed keys → show diff → write → push
                caps: cloud.budget, LOOMLOCALE_MAX_CHARS / LOOMLOCALE_MAX_COST (exit 1 when over)
                interrupted runs resume from tongue.lock.run.json; 429/503 retried with backoff
  tongue status [--json] | push | pull [--prefer local|remote] [--dry-run]
  Global: --base-url <url> (or LOOMLOCALE_API_URL), CI auth via LOOMLOCALE_TOKEN

  tongue migrate next-intl [--dry-run] [--json] [--out report.json]

Exit codes: 0 ok, 1 check/build failures, 2 usage/config error
`);
}
