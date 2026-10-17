import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../config/load-config.js';
import { collectArgs } from '../compiler/ast.js';
import { loadLocaleMessages, resolveMessagePath } from '../compiler/load-messages.js';
import { parseMessage } from '../compiler/parse/icu-parser.js';
import { checkPluralCategories } from '../compiler/validate/plurals.js';
import { TongueError } from '../errors.js';

export type TranslateCliOptions = {
  cwd?: string;
  config?: string;
  locale?: string;
  keys?: string;
  dryRun?: boolean;
  yes?: boolean;
  retranslate?: boolean;
  /** true/false override; undefined → CI defaults to review. */
  review?: boolean;
  accept?: boolean;
  concurrency?: number;
  /** Estimated-token budget (overrides config.translate.maxTokens). */
  maxCost?: number;
  quiet?: boolean;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
};

type GlossaryTerm =
  | { doNotTranslate: true; note?: string }
  | ({ doNotTranslate?: false; note?: string } & Record<string, string | boolean | undefined>);

type Glossary = {
  terms: Record<string, GlossaryTerm>;
};

type LockFile = {
  version: number;
  [locale: string]:
    | number
    | Record<string, { source: string; target: string; model?: string; at?: string }>;
};

type KeyMeta = {
  description?: string;
  screenshot?: string;
  maxLength?: number;
};

function sha(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function maskIcu(source: string): {
  masked: string;
  restore: (out: string) => string | null;
} {
  const tokens: string[] = [];
  const masked = source.replace(/\{[^{}]+\}|<(\/)?([A-Za-z][\w]*)\s*\/?>/g, (m) => {
    const id = `__TONGUE_${tokens.length}__`;
    tokens.push(m);
    return id;
  });
  return {
    masked,
    restore(out: string) {
      let result = out;
      for (let i = 0; i < tokens.length; i++) {
        const id = `__TONGUE_${i}__`;
        if (!result.includes(id)) return null;
        result = result.split(id).join(tokens[i]!);
      }
      if (/__TONGUE_\d+__/.test(result)) return null;
      return result;
    },
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function loadGlossary(cwd: string, path: string | undefined): Promise<Glossary> {
  if (!path) return { terms: {} };
  try {
    return JSON.parse(await readFile(resolve(cwd, path), 'utf8')) as Glossary;
  } catch {
    return { terms: {} };
  }
}

async function loadLock(cwd: string, path: string): Promise<LockFile> {
  try {
    return JSON.parse(await readFile(resolve(cwd, path), 'utf8')) as LockFile;
  } catch {
    return { version: 1 };
  }
}

async function loadKeyMeta(
  cwd: string,
  pattern: string,
  locale: string,
): Promise<Record<string, KeyMeta>> {
  const out: Record<string, KeyMeta> = {};
  try {
    const raw = await readFile(resolveMessagePath(cwd, pattern, locale), 'utf8');
    walkMeta(JSON.parse(raw) as Record<string, unknown>, '', out);
  } catch {
    /* optional */
  }
  return out;
}

function walkMeta(
  node: Record<string, unknown>,
  prefix: string,
  out: Record<string, KeyMeta>,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (key.endsWith('$description') && typeof value === 'string') {
      const base = key.slice(0, -'$description'.length);
      const full = prefix ? `${prefix}.${base}` : base;
      out[full] = { ...out[full], description: value };
      continue;
    }
    if (key.endsWith('$meta') && value && typeof value === 'object') {
      const base = key.slice(0, -'$meta'.length);
      const full = prefix ? `${prefix}.${base}` : base;
      const meta = value as Record<string, unknown>;
      const entry: KeyMeta = { ...out[full] };
      if (typeof meta.description === 'string') entry.description = meta.description;
      if (typeof meta.screenshot === 'string') entry.screenshot = meta.screenshot;
      if (typeof meta.maxLength === 'number') entry.maxLength = meta.maxLength;
      out[full] = entry;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (!key.includes('$')) walkMeta(value as Record<string, unknown>, full, out);
    }
  }
}

function matchKeyPattern(fullKey: string, pattern: string | undefined): boolean {
  if (!pattern) return true;
  const parts = pattern.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.some((p) => {
    if (p.endsWith('.*')) return fullKey.startsWith(p.slice(0, -1));
    if (p.includes('*')) {
      const re = new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return re.test(fullKey);
    }
    return fullKey === p;
  });
}

export async function cmdTranslate(opts: TranslateCliOptions): Promise<void> {
  const { config, cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });

  const tcfg = config.translate ?? {};
  const baseURL = (tcfg.baseURL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = tcfg.model ?? 'gpt-4.1-mini';
  const apiKeyEnv = tcfg.apiKeyEnv ?? 'TONGUE_API_KEY';
  const lockPath = tcfg.lockfile ?? './tongue.lock';
  const glossary = await loadGlossary(cwd, tcfg.glossary);
  const lock = await loadLock(cwd, lockPath);
  const keyMeta = await loadKeyMeta(cwd, config.messages, config.defaultLocale);

  if (opts.accept) {
    await acceptReviews(cwd, config, lockPath, lock, opts.quiet);
    return;
  }

  const locales = (opts.locale ?? config.locales.filter((l) => l !== config.defaultLocale).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCat = catalogs[config.defaultLocale] ?? {};
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  const useReview =
    opts.review === true || (opts.review === undefined && process.env.CI === 'true');
  const plan: Array<{ locale: string; fullKey: string; source: string }> = [];

  for (const locale of locales) {
    if (!config.locales.includes(locale)) {
      throw new TongueError('TONGUE_E_CONFIG', `Unknown locale: ${locale}`);
    }
    const section =
      (typeof lock[locale] === 'object' && lock[locale]
        ? (lock[locale] as Record<string, { source: string; target: string }>)
        : {}) ?? {};
    for (const [ns, keys] of Object.entries(defaultCat)) {
      for (const [key, source] of Object.entries(keys)) {
        const fullKey = ns === '_root' ? key : `${ns}.${key}`;
        if (!matchKeyPattern(fullKey, opts.keys)) continue;
        const target = catalogs[locale]?.[ns]?.[key];
        const entry = section[fullKey];
        const stale = entry != null && entry.source !== sha(source);
        const missing = target == null || target === '';
        const humanEdited =
          entry != null &&
          target != null &&
          entry.target !== sha(target) &&
          !opts.retranslate;
        if (humanEdited) continue;
        if (!missing && !stale && !opts.retranslate) continue;
        plan.push({ locale, fullKey, source });
      }
    }
  }

  let estimated = 0;
  for (const item of plan) {
    const { masked } = maskIcu(item.source);
    estimated += estimateTokens(masked) + 80;
  }

  if (opts.dryRun) {
    if (!opts.quiet) {
      console.log(`tongue translate: dry-run ${plan.length} key(s), ~${estimated} tokens`);
      for (const p of plan) console.log(`  ${p.locale} ${p.fullKey}`);
    }
    return;
  }

  const budget = opts.maxCost ?? tcfg.maxTokens;
  if (budget != null && estimated > budget) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `Estimated ~${estimated} tokens exceeds budget ${budget} (use --max-cost or translate.maxTokens)`,
    );
  }

  const apiKeyRaw = process.env[apiKeyEnv];
  if (!apiKeyRaw) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `Missing API key env ${apiKeyEnv} (never logged)`,
    );
  }
  const apiKey: string = apiKeyRaw;

  const results: Array<{
    locale: string;
    fullKey: string;
    source: string;
    target: string;
  }> = [];

  const concurrency = Math.max(1, opts.concurrency ?? 2);
  let idx = 0;
  async function worker() {
    while (idx < plan.length) {
      const i = idx++;
      const item = plan[i]!;
      const translated = await translateOne({
        item,
        ...(keyMeta[item.fullKey] ? { meta: keyMeta[item.fullKey] } : {}),
        baseURL,
        model,
        apiKey,
        glossary,
        ...(tcfg.context ? { context: tcfg.context } : {}),
        fetchImpl,
      });
      if (translated) results.push({ ...item, target: translated });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (useReview) {
    for (const locale of locales) {
      const subset = results.filter((r) => r.locale === locale);
      if (!subset.length) continue;
      const path = resolve(
        cwd,
        config.messages.replaceAll('{locale}', locale).replace(/\.json$/, '.review.json'),
      );
      const obj: Record<string, string> = {};
      for (const r of subset) obj[r.fullKey] = r.target;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
      if (!opts.quiet) console.log(`tongue translate: wrote review ${path}`);
    }
    return;
  }

  for (const locale of locales) {
    const subset = results.filter((r) => r.locale === locale);
    if (!subset.length) continue;
    const msgPath = resolveMessagePath(cwd, config.messages, locale);
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(await readFile(msgPath, 'utf8')) as Record<string, unknown>;
    } catch {
      json = {};
    }
    const section =
      (typeof lock[locale] === 'object' && lock[locale]
        ? (lock[locale] as Record<string, { source: string; target: string; model?: string; at?: string }>)
        : {}) ?? {};
    for (const r of subset) {
      setNested(json, r.fullKey, r.target);
      section[r.fullKey] = {
        source: sha(r.source),
        target: sha(r.target),
        model,
        at: new Date().toISOString(),
      };
    }
    lock[locale] = section;
    await writeFile(msgPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    if (!opts.quiet) console.log(`tongue translate: wrote ${subset.length} → ${msgPath}`);
  }
  await writeFile(resolve(cwd, lockPath), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

async function translateOne(args: {
  item: { locale: string; fullKey: string; source: string };
  meta?: KeyMeta;
  baseURL: string;
  model: string;
  apiKey: string;
  glossary: Glossary;
  context?: string;
  fetchImpl: typeof fetch;
}): Promise<string | null> {
  const { item, meta, baseURL, model, apiKey, glossary, context, fetchImpl } = args;
  const { masked, restore } = maskIcu(item.source);
  const glossLines = Object.entries(glossary.terms)
    .map(([term, spec]) => {
      if (spec.doNotTranslate === true) {
        return `- Keep "${term}" untranslated`;
      }
      const t = spec[item.locale];
      return typeof t === 'string' ? `- "${term}" → "${t}"` : null;
    })
    .filter(Boolean)
    .join('\n');

  const metaLines = [
    meta?.description ? `Description: ${meta.description}` : '',
    meta?.screenshot ? `Screenshot: ${meta.screenshot}` : '',
    meta?.maxLength != null ? `Max length: ${meta.maxLength} characters` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const system = [
    'You translate ICU MessageFormat strings. Preserve every __TONGUE_n__ token exactly.',
    'Return only the translated string, no quotes or commentary.',
    context ? `Product context: ${context}` : '',
    glossLines ? `Glossary:\n${glossLines}` : '',
    metaLines,
  ]
    .filter(Boolean)
    .join('\n');

  for (let attempt = 0; attempt < 2; attempt++) {
    const lengthHint =
      attempt > 0 && meta?.maxLength != null
        ? `\nPrevious output was too long. Keep under ${meta.maxLength} characters.`
        : '';
    const res = await fetchImpl(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Translate to ${item.locale} (key ${item.fullKey}):\n${masked}${lengthHint}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`tongue translate: HTTP ${res.status} for ${item.fullKey}`);
      return null;
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content?.trim() ?? '';
    const restored = restore(content);
    if (!restored) {
      console.error(`tongue translate: token restore failed for ${item.fullKey}`);
      continue;
    }
    try {
      validateParity(item.source, restored, item.locale);
      checkGlossary(restored, glossary, item.locale);
      if (meta?.maxLength != null && [...restored].length > meta.maxLength) {
        throw new Error(`over maxLength ${meta.maxLength}`);
      }
      return restored;
    } catch (err) {
      console.error(
        `tongue translate: ${item.fullKey}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return null;
}

export function validateParity(source: string, target: string, locale: string): void {
  const sa = collectArgs(parseMessage(source, { file: 'src', key: 'k' }));
  const ta = collectArgs(parseMessage(target, { file: 'tgt', key: 'k' }));
  const missing = Object.keys(sa).filter((a) => !(a in ta));
  const extra = Object.keys(ta).filter((a) => !(a in sa));
  if (missing.length || extra.length) {
    throw new Error(`arg mismatch missing=[${missing}] extra=[${extra}]`);
  }
  for (const issue of checkPluralCategories(
    parseMessage(target, { file: 'tgt', key: 'k' }),
    locale,
  )) {
    if (issue.kind === 'extra-category') {
      throw new Error(`bad plural category ${issue.category}`);
    }
  }
}

function checkGlossary(target: string, glossary: Glossary, locale: string): void {
  for (const [, spec] of Object.entries(glossary.terms)) {
    if (spec.doNotTranslate === true) continue;
    const expected = spec[locale];
    if (typeof expected === 'string' && !target.includes(expected)) {
      throw new Error(`glossary term missing: expected "${expected}"`);
    }
  }
}

async function acceptReviews(
  cwd: string,
  config: Awaited<ReturnType<typeof loadConfig>>['config'],
  lockPath: string,
  lock: LockFile,
  quiet?: boolean,
): Promise<void> {
  const catalogs = await loadLocaleMessages(config, cwd);
  const defaultCat = catalogs[config.defaultLocale] ?? {};
  for (const locale of config.locales) {
    if (locale === config.defaultLocale) continue;
    const reviewPath = resolve(
      cwd,
      config.messages.replaceAll('{locale}', locale).replace(/\.json$/, '.review.json'),
    );
    let reviews: Record<string, string>;
    try {
      reviews = JSON.parse(await readFile(reviewPath, 'utf8')) as Record<string, string>;
    } catch {
      continue;
    }
    const msgPath = resolveMessagePath(cwd, config.messages, locale);
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(await readFile(msgPath, 'utf8')) as Record<string, unknown>;
    } catch {
      json = {};
    }
    const section =
      (typeof lock[locale] === 'object' && lock[locale]
        ? (lock[locale] as Record<string, { source: string; target: string; at?: string }>)
        : {}) ?? {};
    for (const [fullKey, target] of Object.entries(reviews)) {
      const dot = fullKey.indexOf('.');
      const ns = dot === -1 ? '_root' : fullKey.slice(0, dot);
      const key = dot === -1 ? fullKey : fullKey.slice(dot + 1);
      const source = defaultCat[ns]?.[key] ?? '';
      setNested(json, fullKey, target);
      section[fullKey] = {
        source: sha(source),
        target: sha(target),
        at: new Date().toISOString(),
      };
    }
    lock[locale] = section;
    await writeFile(msgPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    if (!quiet) console.log(`tongue translate: accepted ${reviewPath}`);
  }
  await writeFile(resolve(cwd, lockPath), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

function setNested(root: Record<string, unknown>, fullKey: string, value: string): void {
  const parts = fullKey.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}
