import { parseArgs } from 'node:util';
import { loadConfig } from '../config/load-config.js';
import { buildMessages } from '../compiler/build.js';
import { TongueError } from '../errors.js';

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
    },
    allowPositionals: true,
    strict: false,
  });

  const command = positionals[0];

  if (!command || values.help) {
    printHelp();
    if (!command) process.exitCode = 2;
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
      case 'init':
        console.error(
          'tongue init lands in v0.3. Create tongue.config.ts manually for now — see docs/getting-started.md',
        );
        process.exitCode = 2;
        break;
      case 'check':
      case 'extract':
      case 'translate':
      case 'export':
      case 'import':
      case 'report':
        console.error(`\`tongue ${command}\` is not implemented yet (see ROADMAP).`);
        process.exitCode = 2;
        break;
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

function printHelp(): void {
  console.log(`next-tongue CLI

Usage:
  tongue build [--cwd <dir>] [--config <path>] [--json] [--quiet]
  tongue init | check | extract | translate   (later milestones)

Exit codes: 0 ok, 1 check/build failures, 2 usage/config error
`);
}
