import type { MessageAst, MessageElement, DateTimeStyle, NumberStyle } from '../ast.js';

export type EmitContext = {
  locale: string;
  timeZone: string;
  formats: {
    number: Record<string, Intl.NumberFormatOptions>;
    dateTime: Record<string, Intl.DateTimeFormatOptions>;
  };
};

/**
 * Emit a pure message function body for one locale AST.
 * Formatters are created lazily inside the function (never at module load).
 * Tags are stripped to children text (use {@link emitRichMessageFunction} for t.rich).
 */
export function emitMessageFunction(
  exportName: string,
  ast: MessageAst,
  ctx: EmitContext,
  opts: { withLocaleArg: boolean; exported?: boolean },
): string {
  const exported = opts.exported !== false;
  const args = collectArgNames(ast);
  const hasArgs = args.size > 0;
  const needsPlural = hasPoundOrPlural(ast);

  const lazy: string[] = [];
  let lazyId = 0;
  const nextLazy = (expr: string) => {
    const id = `_f${lazyId++}`;
    lazy.push(`let ${id};`);
    return `(${id} ??= ${expr})`;
  };

  const body = emitNodes(ast, {
    ctx,
    nextLazy,
    valuesExpr: 'values',
    localeExpr: opts.withLocaleArg ? 'locale' : JSON.stringify(ctx.locale),
    countExpr: needsPlural ? 'values.__count' : '0',
    mode: 'string',
    tagIndex: { n: 0 },
  });

  const localeParam = opts.withLocaleArg ? 'locale, ' : '';
  const valuesParam = hasArgs || needsPlural ? 'values' : '';
  const decl = exported ? 'export function' : 'function';

  if (!hasArgs && !hasFormatters(ast) && !hasTags(ast)) {
    const lit = stringifyAstAsConstant(ast);
    if (lit != null) {
      if (opts.withLocaleArg) {
        return `${decl} ${exportName}(_locale) {\n  return ${JSON.stringify(lit)};\n}\n`;
      }
      return `${decl} ${exportName}() {\n  return ${JSON.stringify(lit)};\n}\n`;
    }
  }

  const lazyBlock = lazy.length ? lazy.join('\n  ') + '\n  ' : '';
  return (
    `${decl} ${exportName}(${localeParam}${valuesParam ? 'values' : '_values'}) {\n` +
    `  ${lazyBlock}return ${body};\n` +
    `}\n`
  );
}

/**
 * Emit a rich-text message function that applies tag handlers from `values`
 * and returns ReactNodes with stable keys per tag index.
 */
export function emitRichMessageFunction(
  exportName: string,
  ast: MessageAst,
  ctx: EmitContext,
  opts: { withLocaleArg: boolean; exported?: boolean },
): string {
  const exported = opts.exported !== false;
  const args = collectArgNames(ast);
  const hasArgs = args.size > 0;
  const needsPlural = hasPoundOrPlural(ast);

  const lazy: string[] = [];
  let lazyId = 0;
  const nextLazy = (expr: string) => {
    const id = `_f${lazyId++}`;
    lazy.push(`let ${id};`);
    return `(${id} ??= ${expr})`;
  };

  const body = emitNodes(ast, {
    ctx,
    nextLazy,
    valuesExpr: 'values',
    localeExpr: opts.withLocaleArg ? 'locale' : JSON.stringify(ctx.locale),
    countExpr: needsPlural ? 'values.__count' : '0',
    mode: 'rich',
    tagIndex: { n: 0 },
  });

  const localeParam = opts.withLocaleArg ? 'locale, ' : '';
  const valuesParam = hasArgs || needsPlural || hasTags(ast) ? 'values' : '';
  const decl = exported ? 'export function' : 'function';
  const lazyBlock = lazy.length ? lazy.join('\n  ') + '\n  ' : '';
  return (
    `${decl} ${exportName}(${localeParam}${valuesParam ? 'values' : '_values'}) {\n` +
    `  ${lazyBlock}return ${body};\n` +
    `}\n`
  );
}

/** True when the AST contains at least one rich tag. */
export function hasTags(ast: MessageAst): boolean {
  for (const el of ast) {
    if (el.type === 'tag') return true;
    if ('options' in el) {
      for (const opt of el.options) {
        if (hasTags(opt.value)) return true;
      }
    }
  }
  return false;
}

type EmitState = {
  ctx: EmitContext;
  nextLazy: (expr: string) => string;
  valuesExpr: string;
  localeExpr: string;
  countExpr: string;
  mode: 'string' | 'rich';
  tagIndex: { n: number };
};

function emitNodes(ast: MessageAst, s: EmitState): string {
  if (s.mode === 'rich') {
    if (ast.length === 0) return 'null';
    if (ast.length === 1) return emitNode(ast[0]!, s);
    return `_rj([${ast.map((n) => emitNode(n, s)).join(', ')}])`;
  }
  if (ast.length === 0) return '""';
  if (ast.length === 1) return emitNode(ast[0]!, s);
  return `(${ast.map((n) => emitNode(n, s)).join(' + ')})`;
}

function emitNode(el: MessageElement, s: EmitState): string {
  switch (el.type) {
    case 'literal':
      return JSON.stringify(el.value);
    case 'argument':
      return `String(${s.valuesExpr}[${JSON.stringify(el.name)}])`;
    case 'pound':
      return `String(${s.countExpr})`;
    case 'number': {
      const opts = numberOpts(el.style, s.ctx);
      const fmt = s.nextLazy(
        `new Intl.NumberFormat(${s.localeExpr}, ${JSON.stringify(opts)})`,
      );
      return `${fmt}.format(${s.valuesExpr}[${JSON.stringify(el.name)}])`;
    }
    case 'date':
    case 'time': {
      const opts = dateOpts(el.style, s.ctx, el.type);
      const fmt = s.nextLazy(
        `new Intl.DateTimeFormat(${s.localeExpr}, ${JSON.stringify(opts)})`,
      );
      return `${fmt}.format(${s.valuesExpr}[${JSON.stringify(el.name)}])`;
    }
    case 'plural':
    case 'selectordinal': {
      const type = el.type === 'selectordinal' ? 'ordinal' : 'cardinal';
      const pr = s.nextLazy(
        `new Intl.PluralRules(${s.localeExpr}, { type: ${JSON.stringify(type)} })`,
      );
      const count = `${s.valuesExpr}[${JSON.stringify(el.name)}]`;
      const offsetCount =
        el.offset !== 0 ? `(${count} - ${el.offset})` : count;
      const exact = el.options.filter((o) => String(o.selector).startsWith('='));
      const cats = el.options.filter((o) => !String(o.selector).startsWith('='));
      const other = cats.find((c) => c.selector === 'other');
      const catExpr = `${pr}.select(${offsetCount})`;
      const empty = s.mode === 'rich' ? 'null' : '""';
      let nested = other
        ? emitNodes(other.value, { ...s, countExpr: offsetCount })
        : empty;
      for (const opt of cats) {
        if (opt.selector === 'other') continue;
        const branch = emitNodes(opt.value, { ...s, countExpr: offsetCount });
        nested = `${catExpr} === ${JSON.stringify(opt.selector)} ? ${branch} : ${nested}`;
      }
      let expr = nested;
      for (const opt of exact) {
        const n = String(opt.selector).slice(1);
        const branch = emitNodes(opt.value, { ...s, countExpr: offsetCount });
        expr = `${count} === ${n} ? ${branch} : ${expr}`;
      }
      return expr;
    }
    case 'select': {
      const val = `String(${s.valuesExpr}[${JSON.stringify(el.name)}])`;
      const other = el.options.find((o) => o.selector === 'other');
      const empty = s.mode === 'rich' ? 'null' : '""';
      let nested = other ? emitNodes(other.value, s) : empty;
      for (const opt of [...el.options].reverse()) {
        if (opt.selector === 'other') continue;
        nested = `${val} === ${JSON.stringify(opt.selector)} ? ${emitNodes(opt.value, s)} : ${nested}`;
      }
      return nested;
    }
    case 'tag':
      if (s.mode === 'string') {
        // Plain t() strips tags to children text
        return emitNodes(el.children, s);
      }
      {
        const idx = s.tagIndex.n++;
        if (el.selfClosing) {
          return `_rs(${s.valuesExpr}[${JSON.stringify(el.name)}], ${idx})`;
        }
        const chunks = emitNodes(el.children, s);
        return `_rt(${s.valuesExpr}[${JSON.stringify(el.name)}], ${chunks}, ${idx})`;
      }
    default:
      return s.mode === 'rich' ? 'null' : '""';
  }
}

function numberOpts(
  style: NumberStyle | undefined,
  ctx: EmitContext,
): Intl.NumberFormatOptions {
  if (!style) return {};
  if (typeof style === 'string') {
    if (style === 'integer') return { maximumFractionDigits: 0 };
    if (style === 'percent') return { style: 'percent' };
    if (style === 'currency') return { style: 'currency', currency: 'USD' };
  }
  if (typeof style === 'object' && 'preset' in style) {
    return ctx.formats.number[style.preset] ?? {};
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
  ctx: EmitContext,
  kind: 'date' | 'time',
): Intl.DateTimeFormatOptions {
  const base: Intl.DateTimeFormatOptions = { timeZone: ctx.timeZone };
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
  if ('preset' in style) {
    return { ...base, ...(ctx.formats.dateTime[style.preset] ?? {}) };
  }
  // skeleton: map common field letters lightly
  return { ...base, ...skeletonToDateOpts(style.skeleton) };
}

function skeletonToDateOpts(skeleton: string): Intl.DateTimeFormatOptions {
  const opts: Intl.DateTimeFormatOptions = {};
  if (skeleton.includes('y')) opts.year = skeleton.includes('yyyy') ? 'numeric' : '2-digit';
  if (skeleton.includes('M')) {
    opts.month =
      skeleton.includes('MMMM') ? 'long' : skeleton.includes('MMM') ? 'short' : 'numeric';
  }
  if (skeleton.includes('d')) opts.day = 'numeric';
  if (skeleton.includes('H') || skeleton.includes('h')) opts.hour = 'numeric';
  if (skeleton.includes('m')) opts.minute = 'numeric';
  if (skeleton.includes('s')) opts.second = 'numeric';
  return opts;
}

function collectArgNames(ast: MessageAst, into = new Set<string>()): Set<string> {
  for (const el of ast) {
    switch (el.type) {
      case 'argument':
      case 'number':
      case 'date':
      case 'time':
      case 'plural':
      case 'selectordinal':
      case 'select':
        into.add(el.name);
        if ('options' in el) {
          for (const opt of el.options) collectArgNames(opt.value, into);
        }
        break;
      case 'tag':
        into.add(el.name);
        collectArgNames(el.children, into);
        break;
    }
  }
  return into;
}

function hasPoundOrPlural(ast: MessageAst): boolean {
  for (const el of ast) {
    if (el.type === 'pound' || el.type === 'plural' || el.type === 'selectordinal') return true;
    if ('options' in el) {
      for (const opt of el.options) {
        if (hasPoundOrPlural(opt.value)) return true;
      }
    }
    if (el.type === 'tag' && hasPoundOrPlural(el.children)) return true;
  }
  return false;
}

function hasFormatters(ast: MessageAst): boolean {
  for (const el of ast) {
    if (el.type === 'number' || el.type === 'date' || el.type === 'time') return true;
    if (el.type === 'plural' || el.type === 'selectordinal' || el.type === 'select') {
      for (const opt of el.options) {
        if (hasFormatters(opt.value)) return true;
      }
    }
    if (el.type === 'tag' && hasFormatters(el.children)) return true;
  }
  return false;
}

function stringifyAstAsConstant(ast: MessageAst): string | null {
  let out = '';
  for (const el of ast) {
    if (el.type === 'literal') out += el.value;
    else if (el.type === 'tag') {
      const inner = stringifyAstAsConstant(el.children);
      if (inner == null) return null;
      out += inner;
    } else return null;
  }
  return out;
}

/** ECMAScript reserved words / strict-mode reserved — unsafe as bare identifiers. */
const RESERVED_IDENTS = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

/** Safe JS identifier from a message key (e.g. `continue` → `continue_`). */
export function safeIdent(key: string): string {
  let cleaned = key.replace(/[^A-Za-z0-9_]/g, '_');
  if (!cleaned) cleaned = '_';
  if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
  if (RESERVED_IDENTS.has(cleaned)) cleaned = `${cleaned}_`;
  return cleaned;
}
