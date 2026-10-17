import { readFile, writeFile } from 'node:fs/promises';
import * as readline from 'node:readline';
import { loadConfig } from '../config/load-config.js';
import { buildMessages } from '../compiler/build.js';
import { loadLocaleMessages, resolveMessagePath } from '../compiler/load-messages.js';
import {
  DEFAULT_SCAN_ROOTS,
  scanReferencedKeys,
} from '../compiler/scan-keys.js';
import { TongueError } from '../errors.js';

export type ExtractCliOptions = {
  cwd?: string;
  config?: string;
  include?: string;
  placeholder?: string;
  prune?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  quiet?: boolean;
};

type Nested = Record<string, unknown>;

export async function cmdExtract(opts: ExtractCliOptions): Promise<void> {
  const { config, cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });

  if (config.messages.includes('{namespace}')) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      'tongue extract does not yet support per-namespace message files',
    );
  }

  const roots = opts.include
    ? opts.include.split(',').map((s) => s.trim()).filter(Boolean)
    : config.scan.include.length > 0
      ? [...config.scan.include]
      : [...DEFAULT_SCAN_ROOTS];

  const refs = await scanReferencedKeys(cwd, roots);
  const used = new Set(refs.map((r) => r.fullKey));

  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCatalog = catalogs[config.defaultLocale] ?? {};
  const defined = new Set<string>();
  for (const [ns, msgs] of Object.entries(defaultCatalog)) {
    for (const key of Object.keys(msgs)) {
      defined.add(ns === '_root' ? key : `${ns}.${key}`);
    }
  }

  const missing = [...used].filter((k) => !defined.has(k)).sort();
  const unused = [...defined].filter((k) => !used.has(k)).sort();

  const placeholder = opts.placeholder ?? null; // null → use key as value
  const abs = resolveMessagePath(cwd, config.messages, config.defaultLocale);

  let raw: string;
  try {
    raw = await readFile(abs, 'utf8');
  } catch (err) {
    throw new TongueError(
      'TONGUE_E_IO',
      `Cannot read default-locale messages: ${abs} (${err instanceof Error ? err.message : err})`,
      { file: abs },
    );
  }

  let json: Nested;
  try {
    json = JSON.parse(raw) as Nested;
  } catch (err) {
    throw new TongueError(
      'TONGUE_E_PARSE',
      `Invalid JSON: ${err instanceof Error ? err.message : err}`,
      { file: abs },
    );
  }

  let added = 0;
  let pruned = 0;

  for (const fullKey of missing) {
    const value = placeholder === null ? fullKey : placeholder;
    setNested(json, fullKey, value);
    added++;
  }

  if (opts.prune && unused.length > 0) {
    const ok =
      opts.yes || opts.dryRun
        ? true
        : await confirm(
            `Remove ${unused.length} unused key(s) from ${config.defaultLocale}? [y/N] `,
          );
    if (ok) {
      for (const fullKey of unused) {
        if (deleteNested(json, fullKey)) pruned++;
      }
    }
  }

  const next = `${JSON.stringify(json, null, 2)}\n`;
  const changed = next !== raw;

  if (opts.json) {
    console.log(
      JSON.stringify({
        missing,
        unused,
        added: opts.dryRun ? missing.length : added,
        pruned: opts.dryRun ? (opts.prune ? unused.length : 0) : pruned,
        dryRun: opts.dryRun === true,
        file: abs,
      }),
    );
  } else if (!opts.quiet) {
    if (missing.length) {
      console.log(
        `tongue extract: ${opts.dryRun ? 'would add' : 'adding'} ${missing.length} key(s):`,
      );
      for (const k of missing) console.log(`  + ${k}`);
    }
    if (unused.length) {
      console.log(
        `tongue extract: ${unused.length} unused key(s)${
          opts.prune ? (opts.dryRun ? ' (would prune)' : '') : ' (pass --prune to remove)'
        }:`,
      );
      for (const k of unused) console.log(`  - ${k}`);
    }
    if (!missing.length && !unused.length) {
      console.log('tongue extract: nothing to do');
    }
  }

  if (opts.dryRun || !changed) return;

  await writeFile(abs, next, 'utf8');
  if (!opts.quiet && !opts.json) {
    console.log(
      `tongue extract: wrote ${abs} (+${added}${pruned ? `, -${pruned}` : ''})`,
    );
  }
  const result = await buildMessages({ config, cwd });
  if (!opts.quiet && !opts.json) {
    console.log(
      `tongue extract: rebuilt ${result.keyCount} keys → ${result.outDir}`,
    );
  }
}

function setNested(root: Nested, fullKey: string, value: string): void {
  const parts = fullKey.split('.');
  let cur: Nested = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Nested;
  }
  cur[parts[parts.length - 1]!] = value;
}

function deleteNested(root: Nested, fullKey: string): boolean {
  const parts = fullKey.split('.');
  const stack: { obj: Nested; key: string }[] = [];
  let cur: Nested = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      return false;
    }
    stack.push({ obj: cur, key: p });
    cur = next as Nested;
  }
  const leaf = parts[parts.length - 1]!;
  if (!(leaf in cur)) return false;
  delete cur[leaf];
  // Prune empty objects upward
  for (let i = stack.length - 1; i >= 0; i--) {
    const { obj, key } = stack[i]!;
    const child = obj[key];
    if (
      child &&
      typeof child === 'object' &&
      !Array.isArray(child) &&
      Object.keys(child as object).length === 0
    ) {
      delete obj[key];
    } else break;
  }
  return true;
}

function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolvePromise) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolvePromise(/^[yY]/.test(answer.trim()));
    });
  });
}
