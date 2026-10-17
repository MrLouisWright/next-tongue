#!/usr/bin/env node
import { runCli } from '../dist/cli/index.js';

runCli(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
