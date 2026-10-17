import { createElement, Fragment, type ReactNode } from 'react';
import type {
  DateTimeStyle,
  MessageAst,
  MessageElement,
  NumberStyle,
} from '../compiler/ast.js';
import { parseMessage } from '../compiler/parse/icu-parser.js';
import { pseudoLocalizeAst } from '../compiler/pseudo.js';
import { TongueError } from '../errors.js';
import { LruCache } from './lru.js';

export type FormatMessageValues = Record<string, unknown>;

export type FormatMessageRichOptions = {
  tags?: Record<
    string,
    ((chunks: ReactNode) => ReactNode) | (() => ReactNode)
  >;
};

export type FormatMessageConfig = {
  cacheSize?: number;
  timeZone?: string;
  /** When set, `formatMessage(pseudo.locale, …)` accents+expands literals (#36). */
  pseudo?: { locale: string; expand?: number } | false;
};

type Compiled = {
  ast: MessageAst;
};

let cacheSize = 500;
let defaultTimeZone = 'UTC';
let pseudoCfg: { locale: string; expand: number } | false = false;
let cache = new LruCache<string, Compiled>(cacheSize);

export function configureFormatMessage(opts: FormatMessageConfig): void {
  if (opts.cacheSize != null && opts.cacheSize !== cacheSize) {
    cacheSize = opts.cacheSize;
    cache = new LruCache(cacheSize);
  }
  if (opts.timeZone != null) defaultTimeZone = opts.timeZone;
  if (opts.pseudo !== undefined) {
    pseudoCfg =
      opts.pseudo === false
        ? false
        : {
            locale: opts.pseudo.locale,
            expand: opts.pseudo.expand ?? 0.35,
          };
    cache.clear();
  }
}

/** @internal test helper */
export function __resetFormatMessageCache(): void {
  cache.clear();
  pseudoCfg = false;
}

/** @internal test helper */
export function __formatMessageCacheSize(): number {
  return cache.size;
}

function assertServer(): void {
  if (typeof document !== 'undefined') {
    throw new TongueError(
      'TONGUE_E_BUILD',
      'formatMessage is server-only; pass the rendered string to client components as a prop',
    );
  }
}

function compile(icu: string, applyPseudo: boolean): Compiled {
  const cacheKey = applyPseudo
    ? `p:${pseudoCfg ? pseudoCfg.expand : 0}:${icu}`
    : icu;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  try {
    let ast = parseMessage(icu, { file: 'formatMessage', key: 'icu' });
    if (applyPseudo && pseudoCfg) {
      ast = pseudoLocalizeAst(ast, { expand: pseudoCfg.expand });
    }
    const compiled = { ast };
    cache.set(cacheKey, compiled);
    return compiled;
  } catch (err) {
    if (err instanceof TongueError) {
      const loc: {
        file?: string;
        key?: string;
        line?: number;
        column?: number;
      } = {};
      if (err.file != null) loc.file = err.file;
      if (err.key != null) loc.key = err.key;
      if (err.line != null) loc.line = err.line;
      if (err.column != null) loc.column = err.column;
      throw new TongueError('TONGUE_E_ICU_SYNTAX', err.message, loc);
    }
    throw err;
  }
}

function shouldPseudo(locale: string): boolean {
  return Boolean(pseudoCfg && locale === pseudoCfg.locale);
}

/**
 * Request-time ICU formatting (ADR 0013). Untyped; tags stripped to text.
 * Pure — reads no request data; safe inside `'use cache'`.
 */
export function formatMessage(
  locale: string,
  icu: string,
  values?: FormatMessageValues,
): string {
  assertServer();
  const { ast } = compile(icu, shouldPseudo(locale));
  return formatAst(ast, {
    locale,
    values: values ?? {},
    timeZone: defaultTimeZone,
    mode: 'string',
    count: 0,
    tagIndex: { n: 0 },
    tags: undefined,
  }) as string;
}

formatMessage.configure = configureFormatMessage;

formatMessage.rich = function formatMessageRich(
  locale: string,
  icu: string,
  values?: FormatMessageValues,
  options?: FormatMessageRichOptions,
): ReactNode {
  assertServer();
  const { ast } = compile(icu, shouldPseudo(locale));
  return formatAst(ast, {
    locale,
    values: values ?? {},
    timeZone: defaultTimeZone,
    mode: 'rich',
    count: 0,
    tagIndex: { n: 0 },
    tags: options?.tags,
  });
};

type EvalState = {
  locale: string;
  values: FormatMessageValues;
  timeZone: string;
  mode: 'string' | 'rich';
  count: number;
  tagIndex: { n: number };
  tags: FormatMessageRichOptions['tags'];
};

function formatAst(ast: MessageAst, s: EvalState): string | ReactNode {
  if (s.mode === 'string') {
    if (ast.length === 0) return '';
    if (ast.length === 1) return String(formatNode(ast[0]!, s));
    return ast.map((n) => String(formatNode(n, s))).join('');
  }
  if (ast.length === 0) return null;
  if (ast.length === 1) return formatNode(ast[0]!, s);
  return ast.map((n) => formatNode(n, s));
}

function formatNode(el: MessageElement, s: EvalState): string | ReactNode {
  switch (el.type) {
    case 'literal':
      return el.value;
    case 'argument':
      return String(s.values[el.name] ?? '');
    case 'pound':
      return String(s.count);
    case 'number': {
      const opts = numberOpts(el.style);
      return new Intl.NumberFormat(s.locale, opts).format(
        Number(s.values[el.name] ?? 0),
      );
    }
    case 'date':
    case 'time': {
      const opts = dateOpts(el.style, s.timeZone, el.type);
      const v = s.values[el.name];
      const date = v instanceof Date ? v : new Date(Number(v));
      return new Intl.DateTimeFormat(s.locale, opts).format(date);
    }
    case 'plural':
    case 'selectordinal': {
      const type = el.type === 'selectordinal' ? 'ordinal' : 'cardinal';
      const count = Number(s.values[el.name] ?? 0);
      const offsetCount = count - el.offset;
      const pr = new Intl.PluralRules(s.locale, { type });
      const exact = el.options.find((o) => String(o.selector) === `=${count}`);
      if (exact) {
        return formatAst(exact.value, { ...s, count: offsetCount });
      }
      const cat = pr.select(offsetCount);
      const branch =
        el.options.find((o) => o.selector === cat) ??
        el.options.find((o) => o.selector === 'other');
      return branch
        ? formatAst(branch.value, { ...s, count: offsetCount })
        : s.mode === 'rich'
          ? null
          : '';
    }
    case 'select': {
      const val = String(s.values[el.name] ?? '');
      const branch =
        el.options.find((o) => o.selector === val) ??
        el.options.find((o) => o.selector === 'other');
      return branch ? formatAst(branch.value, s) : s.mode === 'rich' ? null : '';
    }
    case 'tag': {
      if (s.mode === 'string') {
        // Strip tags to children text
        return formatAst(el.children, s);
      }
      const idx = s.tagIndex.n++;
      const handler = s.tags?.[el.name];
      if (el.selfClosing) {
        const node =
          typeof handler === 'function' ? (handler as () => ReactNode)() : null;
        return createElement(Fragment, { key: `tongue-t${idx}` }, node);
      }
      const chunks = formatAst(el.children, s);
      const node =
        typeof handler === 'function'
          ? (handler as (c: ReactNode) => ReactNode)(chunks)
          : chunks; // unknown/unlisted tags: pass text through, never raw HTML
      return createElement(Fragment, { key: `tongue-t${idx}` }, node);
    }
    default:
      return s.mode === 'rich' ? null : '';
  }
}

function numberOpts(style: NumberStyle | undefined): Intl.NumberFormatOptions {
  if (!style) return {};
  if (typeof style === 'string') {
    if (style === 'integer') return { maximumFractionDigits: 0 };
    if (style === 'percent') return { style: 'percent' };
    if (style === 'currency') return { style: 'currency', currency: 'USD' };
  }
  if (typeof style === 'object' && 'skeleton' in style) {
    return skeletonToNumberOpts(style.skeleton);
  }
  return {};
}

function skeletonToNumberOpts(skeleton: string): Intl.NumberFormatOptions {
  const opts: Intl.NumberFormatOptions = {};
  for (const part of skeleton.split(/\s+/)) {
    if (part === 'percent') opts.style = 'percent';
    else if (part.startsWith('currency/')) {
      opts.style = 'currency';
      opts.currency = part.slice('currency/'.length);
    } else if (part === 'compact-short') {
      opts.notation = 'compact';
      opts.compactDisplay = 'short';
    } else if (part === 'compact-long') {
      opts.notation = 'compact';
      opts.compactDisplay = 'long';
    } else if (part === 'sign-always') opts.signDisplay = 'always';
    else if (part === 'group-off') opts.useGrouping = false;
    else if (/^\.\d+$/.test(part)) {
      const n = part.length - 1;
      opts.minimumFractionDigits = n;
      opts.maximumFractionDigits = n;
    } else if (/^\.\d*#+$/.test(part)) {
      const hashes = (part.match(/#/g) ?? []).length;
      const zeros = (part.match(/0/g) ?? []).length;
      opts.minimumFractionDigits = zeros;
      opts.maximumFractionDigits = zeros + hashes;
    } else if (part.startsWith('unit/')) {
      opts.style = 'unit';
      opts.unit = part.slice('unit/'.length);
    }
  }
  return opts;
}

function dateOpts(
  style: DateTimeStyle | undefined,
  timeZone: string,
  kind: 'date' | 'time',
): Intl.DateTimeFormatOptions {
  const base: Intl.DateTimeFormatOptions = { timeZone };
  if (!style) {
    return kind === 'time'
      ? { ...base, timeStyle: 'short' }
      : { ...base, dateStyle: 'medium' };
  }
  if (typeof style === 'string') {
    return kind === 'time'
      ? { ...base, timeStyle: style }
      : { ...base, dateStyle: style };
  }
  if ('skeleton' in style) {
    const opts: Intl.DateTimeFormatOptions = { ...base };
    const sk = style.skeleton;
    if (sk.includes('y')) opts.year = sk.includes('yyyy') ? 'numeric' : '2-digit';
    if (sk.includes('M')) {
      opts.month = sk.includes('MMMM')
        ? 'long'
        : sk.includes('MMM')
          ? 'short'
          : 'numeric';
    }
    if (sk.includes('d')) opts.day = 'numeric';
    if (sk.includes('H') || sk.includes('h')) opts.hour = 'numeric';
    if (sk.includes('m')) opts.minute = 'numeric';
    if (sk.includes('s')) opts.second = 'numeric';
    return opts;
  }
  return base;
}
