import type { MessageAst, MessageElement } from './ast.js';

/** Accent map for en-XA-style pseudo-localisation (ASCII → lookalike). */
const ACCENT: Record<string, string> = {
  a: 'á',
  b: 'β',
  c: 'ç',
  d: 'δ',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ľ',
  m: 'ḿ',
  n: 'ñ',
  o: 'ó',
  p: 'ρ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'χ',
  y: 'ý',
  z: 'ž',
  A: 'Å',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'F',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Î',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ĺ',
  M: 'Ḿ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Û',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Χ',
  Y: 'Ý',
  Z: 'Ž',
};

const PAD = '···';

export type PseudoOptions = {
  /** Fraction to grow literal length (default 0.35). */
  expand?: number;
  /** Wrap expanded literals in `[…]` (default true). */
  brackets?: boolean;
};

/**
 * Accent + expand a plain string. Placeholders/ICU are handled at AST level.
 */
export function pseudoLocalizeString(
  input: string,
  options: PseudoOptions = {},
): string {
  const expand = options.expand ?? 0.35;
  const brackets = options.brackets !== false;
  let accented = '';
  for (const ch of input) {
    accented += ACCENT[ch] ?? ch;
  }
  const target = Math.max(
    accented.length,
    Math.ceil(accented.length * (1 + expand)),
  );
  let out = accented;
  while (out.length < target) {
    const room = target - out.length;
    out += PAD.slice(0, room);
  }
  return brackets ? `[${out}]` : out;
}

/** Deep-clone AST, transforming only `literal` nodes. */
export function pseudoLocalizeAst(
  ast: MessageAst,
  options: PseudoOptions = {},
): MessageAst {
  return ast.map((el) => mapElement(el, options));
}

function mapElement(el: MessageElement, options: PseudoOptions): MessageElement {
  switch (el.type) {
    case 'literal':
      return {
        type: 'literal',
        value: pseudoLocalizeString(el.value, options),
        loc: el.loc,
      };
    case 'plural':
    case 'selectordinal':
      return {
        ...el,
        options: el.options.map((b) => ({
          ...b,
          value: pseudoLocalizeAst(b.value, options),
        })),
      };
    case 'select':
      return {
        ...el,
        options: el.options.map((b) => ({
          ...b,
          value: pseudoLocalizeAst(b.value, options),
        })),
      };
    case 'tag':
      return {
        ...el,
        children: pseudoLocalizeAst(el.children, options),
      };
    default:
      // argument, number, date, time, pound — untouched
      return el;
  }
}
