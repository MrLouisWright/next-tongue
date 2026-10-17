import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { loadConfig } from '../config/load-config.js';
import { collectArgs } from '../compiler/ast.js';
import { loadLocaleMessages, resolveMessagePath } from '../compiler/load-messages.js';
import { parseMessage } from '../compiler/parse/icu-parser.js';
import { checkPluralCategories } from '../compiler/validate/plurals.js';
import { TongueError } from '../errors.js';

export type ExportCliOptions = {
  cwd?: string;
  config?: string;
  format?: 'xliff' | 'csv';
  locale?: string;
  out?: string;
  missingOnly?: boolean;
  quiet?: boolean;
};

export type ImportCliOptions = {
  cwd?: string;
  config?: string;
  file: string;
  dryRun?: boolean;
  quiet?: boolean;
};

type Unit = {
  fullKey: string;
  source: string;
  target: string;
  description?: string;
  state: 'initial' | 'translated' | 'final';
  readonly?: boolean;
};

function sourceHash(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

async function loadLock(
  cwd: string,
  lockPath: string,
): Promise<Record<string, Record<string, { source: string; target?: string }>>> {
  try {
    const raw = await readFile(resolve(cwd, lockPath), 'utf8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, Record<string, { source: string; target?: string }>> = {};
    for (const [k, v] of Object.entries(json)) {
      if (k === 'version' || typeof v !== 'object' || !v) continue;
      out[k] = v as Record<string, { source: string; target?: string }>;
    }
    return out;
  } catch {
    return {};
  }
}

async function collectUnits(
  cwd: string,
  config: Awaited<ReturnType<typeof loadConfig>>['config'],
  locale: string,
  missingOnly: boolean,
): Promise<Unit[]> {
  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCat = catalogs[config.defaultLocale] ?? {};
  const targetCat = catalogs[locale] ?? {};
  const lock = await loadLock(cwd, config.translate?.lockfile ?? './tongue.lock');
  const lockLocale = lock[locale] ?? {};

  // Keys from sources cache are read-only
  const readonlyKeys = new Set<string>();
  try {
    const cache = JSON.parse(
      await readFile(resolve(cwd, config.outDir, 'sources.json'), 'utf8'),
    ) as Array<Record<string, Record<string, Record<string, string>>>>;
    for (const payload of cache) {
      const localeMap = payload[config.defaultLocale] ?? {};
      for (const [ns, keys] of Object.entries(localeMap)) {
        for (const key of Object.keys(keys)) {
          readonlyKeys.add(ns === '_root' ? key : `${ns}.${key}`);
        }
      }
    }
  } catch {
    /* no sources cache */
  }

  const units: Unit[] = [];
  for (const [ns, keys] of Object.entries(defaultCat)) {
    for (const [key, source] of Object.entries(keys)) {
      const fullKey = ns === '_root' ? key : `${ns}.${key}`;
      const target = targetCat[ns]?.[key] ?? '';
      const entry = lockLocale[fullKey];
      const stale = entry != null && entry.source !== sourceHash(source);
      const missing = !target;
      if (missingOnly && !missing && !stale) continue;

      let state: Unit['state'] = 'translated';
      if (missing || stale) state = 'initial';
      else if (entry) state = 'final';

      units.push({
        fullKey,
        source,
        target,
        state,
        ...(readonlyKeys.has(fullKey) ? { readonly: true } : {}),
      });
    }
  }
  return units;
}

export async function cmdExport(opts: ExportCliOptions): Promise<void> {
  const { config, cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });
  const format = opts.format ?? 'xliff';
  const locales = (opts.locale ?? config.locales.filter((l) => l !== config.defaultLocale).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const outDir = resolve(cwd, opts.out ?? './translations');
  await mkdir(outDir, { recursive: true });

  for (const locale of locales) {
    if (!config.locales.includes(locale)) {
      throw new TongueError('TONGUE_E_CONFIG', `Unknown locale: ${locale}`);
    }
    const units = await collectUnits(cwd, config, locale, opts.missingOnly === true);
    if (format === 'csv') {
      const path = join(outDir, `${locale}.csv`);
      await writeFile(path, unitsToCsv(units), 'utf8');
      if (!opts.quiet) console.log(`tongue export: wrote ${path} (${units.length} units)`);
    } else {
      const path = join(outDir, `${locale}.xlf`);
      await writeFile(
        path,
        unitsToXliff(units, config.defaultLocale, locale),
        'utf8',
      );
      if (!opts.quiet) console.log(`tongue export: wrote ${path} (${units.length} units)`);
    }
  }
}

export async function cmdImport(opts: ImportCliOptions): Promise<void> {
  const { config, cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });
  const abs = resolve(cwd, opts.file);
  const raw = await readFile(abs, 'utf8');
  const units = abs.endsWith('.csv') ? csvToUnits(raw) : xliffToUnits(raw);
  const targetLocale = guessLocaleFromFilename(opts.file, config.locales);

  if (!targetLocale) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      'Cannot infer locale from import filename (expected de.xlf / de.csv)',
    );
  }

  const defaultCat = (await loadLocaleMessages(config, cwd))[config.defaultLocale] ?? {};
  const errors: string[] = [];
  const accepted: Unit[] = [];

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.readonly) continue;
    const line = i + 2; // header + 1-based
    try {
      validateTarget(u, defaultCat, targetLocale);
      accepted.push(u);
    } catch (err) {
      errors.push(
        `${opts.file}:${line}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  for (const e of errors) console.error(e);

  if (opts.dryRun) {
    if (!opts.quiet) {
      console.log(
        `tongue import: dry-run ${accepted.length} ok, ${errors.length} invalid`,
      );
    }
    if (errors.length) process.exitCode = 1;
    return;
  }

  if (errors.length) {
    process.exitCode = 1;
    return;
  }

  // Merge into locale JSON
  const msgPath = resolveMessagePath(cwd, config.messages, targetLocale);
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(await readFile(msgPath, 'utf8')) as Record<string, unknown>;
  } catch {
    json = {};
  }
  for (const u of accepted) {
    setNested(json, u.fullKey, u.target);
  }
  await mkdir(dirname(msgPath), { recursive: true });
  await writeFile(msgPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  // Update lockfile
  const lockPath = resolve(cwd, config.translate?.lockfile ?? './tongue.lock');
  let lock: Record<string, unknown> = { version: 1 };
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8')) as Record<string, unknown>;
  } catch {
    /* new */
  }
  const section = (lock[targetLocale] as Record<string, unknown>) ?? {};
  for (const u of accepted) {
    section[u.fullKey] = {
      source: sourceHash(u.source),
      target: sourceHash(u.target),
      at: new Date().toISOString(),
    };
  }
  lock[targetLocale] = section;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

  if (!opts.quiet) {
    console.log(
      `tongue import: wrote ${accepted.length} key(s) → ${msgPath}`,
    );
  }
}

function validateTarget(
  u: Unit,
  defaultCat: Record<string, Record<string, string>>,
  locale: string,
): void {
  const dot = u.fullKey.indexOf('.');
  const ns = dot === -1 ? '_root' : u.fullKey.slice(0, dot);
  const key = dot === -1 ? u.fullKey : u.fullKey.slice(dot + 1);
  const source = defaultCat[ns]?.[key] ?? u.source;
  const sourceAst = parseMessage(source, { file: 'source', key: u.fullKey });
  const targetAst = parseMessage(u.target, { file: 'target', key: u.fullKey });
  const sa = collectArgs(sourceAst);
  const ta = collectArgs(targetAst);
  const missing = Object.keys(sa).filter((a) => !(a in ta));
  const extra = Object.keys(ta).filter((a) => !(a in sa));
  if (missing.length || extra.length) {
    throw new Error(
      `ICU arg mismatch for "${u.fullKey}": missing=[${missing}] extra=[${extra}]`,
    );
  }
  for (const issue of checkPluralCategories(targetAst, locale)) {
    if (issue.kind === 'extra-category') {
      throw new Error(
        `Invalid plural category "${issue.category}" for locale "${locale}" (${u.fullKey})`,
      );
    }
  }
}

function guessLocaleFromFilename(
  file: string,
  locales: readonly string[],
): string | undefined {
  const base = basename(file).replace(/\.(xlf|xliff|csv)$/i, '');
  return locales.find((l) => l === base || base.endsWith(`.${l}`) || base.startsWith(`${l}.`));
}

function setNested(root: Record<string, unknown>, fullKey: string, value: string): void {
  const parts = fullKey.split('.');
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export function unitsToCsv(units: Unit[]): string {
  const rows = [
    'key,description,source,target,readonly',
    ...units.map((u) =>
      [
        csvEscape(u.fullKey),
        csvEscape(u.description ?? ''),
        csvEscape(u.source),
        csvEscape(u.target),
        u.readonly ? '1' : '',
      ].join(','),
    ),
  ];
  return `\uFEFF${rows.join('\n')}\n`;
}

export function csvToUnits(raw: string): Unit[] {
  const text = raw.replace(/^\uFEFF/, '');
  const lines = parseCsv(text);
  if (lines.length < 2) return [];
  const header = lines[0]!.map((h) => h.toLowerCase());
  const iKey = header.indexOf('key');
  const iDesc = header.indexOf('description');
  const iSrc = header.indexOf('source');
  const iTgt = header.indexOf('target');
  const iRo = header.indexOf('readonly');
  const units: Unit[] = [];
  for (const row of lines.slice(1)) {
    if (!row[iKey]) continue;
    units.push({
      fullKey: row[iKey]!,
      source: row[iSrc] ?? '',
      target: row[iTgt] ?? '',
      state: 'translated',
      ...(iDesc >= 0 && row[iDesc] ? { description: row[iDesc] } : {}),
      ...(iRo >= 0 && row[iRo] === '1' ? { readonly: true } : {}),
    });
  }
  return units;
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function unitsToXliff(
  units: Unit[],
  srcLang: string,
  trgLang: string,
): string {
  const body = units
    .map((u) => {
      const note = u.description
        ? `\n      <notes><note>${escapeXml(u.description)}</note></notes>`
        : '';
      const translate = u.readonly ? ' translate="no"' : '';
      return `    <unit id="${escapeXml(u.fullKey)}"${translate}>${note}
      <segment state="${u.state}">
        <source>${escapeXml(u.source)}</source>
        <target>${escapeXml(u.target)}</target>
      </segment>
    </unit>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="${escapeXml(srcLang)}" trgLang="${escapeXml(trgLang)}">
  <file id="tongue">
${body}
  </file>
</xliff>
`;
}

export function xliffToUnits(raw: string): Unit[] {
  const units: Unit[] = [];
  const unitRe =
    /<unit\s+id="([^"]+)"([^>]*)>([\s\S]*?)<\/unit>/g;
  let m: RegExpExecArray | null;
  while ((m = unitRe.exec(raw)) !== null) {
    const fullKey = unescapeXml(m[1]!);
    const attrs = m[2]!;
    const body = m[3]!;
    const source = matchTag(body, 'source');
    const target = matchTag(body, 'target');
    const note = matchTag(body, 'note');
    const stateMatch = /state="(initial|translated|final)"/.exec(body);
    units.push({
      fullKey,
      source,
      target,
      state: (stateMatch?.[1] as Unit['state']) ?? 'translated',
      ...(note ? { description: note } : {}),
      ...(attrs.includes('translate="no"') ? { readonly: true } : {}),
    });
  }
  return units;
}

function matchTag(body: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
  return m ? unescapeXml(m[1]!) : '';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
