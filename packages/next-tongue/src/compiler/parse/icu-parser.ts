import type {
  DateTimeStyle,
  MessageAst,
  MessageElement,
  NumberStyle,
  PluralBranch,
  PluralCategory,
  SelectBranch,
  SourceLocation,
} from '../ast.js';
import { TongueError } from '../../errors.js';

const PLURAL_CATS = new Set<string>(['zero', 'one', 'two', 'few', 'many', 'other']);

const NUMBER_STYLES = new Set(['integer', 'percent', 'currency']);
const DATE_STYLES = new Set(['short', 'medium', 'long', 'full']);

const SUPPORTED_NUMBER_SKELETONS = [
  /^percent$/,
  /^currency\/[A-Z]{3}$/,
  /^compact-short$/,
  /^compact-long$/,
  /^\.\d+$/,
  /^\.\d*#+$/,
  /^unit\/[a-zA-Z0-9-]+$/,
  /^sign-always$/,
  /^group-off$/,
];

export type ParseOptions = {
  file?: string;
  key?: string;
};

export function parseMessage(source: string, options: ParseOptions = {}): MessageAst {
  const p = new Parser(source, options);
  const ast = p.parseMessage();
  p.expectEof();
  return ast;
}

class Parser {
  private readonly src: string;
  private i = 0;
  private readonly file?: string;
  private readonly key?: string;

  constructor(src: string, options: ParseOptions) {
    this.src = src;
    if (options.file != null) this.file = options.file;
    if (options.key != null) this.key = options.key;
  }

  parseMessage(stopAt?: string): MessageAst {
    const out: MessageElement[] = [];
    while (!this.eof()) {
      if (stopAt && this.peekStarts(stopAt)) break;
      if (this.peek() === '}') break;
      if (this.peek() === '<') {
        out.push(this.parseTagOrLiteral());
        continue;
      }
      if (this.peek() === '{') {
        out.push(this.parsePlaceholder());
        continue;
      }
      if (this.peek() === '#' && stopAt === undefined && this.inPluralContext === 0) {
        // bare # outside plural is literal
        out.push(this.parseLiteral(stopAt));
        continue;
      }
      if (this.peek() === '#' && this.inPluralContext > 0) {
        const loc = this.locHere();
        this.advance();
        out.push({ type: 'pound', loc: this.closeLoc(loc) });
        continue;
      }
      out.push(this.parseLiteral(stopAt));
    }
    return out;
  }

  private inPluralContext = 0;

  expectEof(): void {
    if (!this.eof()) {
      this.fail('Unexpected trailing content', 'TONGUE_E_PARSE');
    }
  }

  private parseLiteral(stopAt?: string): MessageElement {
    const loc = this.locHere();
    let value = '';
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === '{' || ch === '}' || ch === '<' || (ch === '#' && this.inPluralContext > 0)) break;
      if (stopAt && this.peekStarts(stopAt)) break;
      if (ch === "'") {
        value += this.parseQuoted();
        continue;
      }
      value += ch;
      this.advance();
    }
    return { type: 'literal', value, loc: this.closeLoc(loc) };
  }

  private parseQuoted(): string {
    // Apostrophe escaping: '' → ', '{ → {, 'text' → text
    this.expect("'");
    if (this.peek() === "'") {
      this.advance();
      return "'";
    }
    let out = '';
    while (!this.eof() && this.peek() !== "'") {
      out += this.peek();
      this.advance();
    }
    if (this.peek() === "'") this.advance();
    return out;
  }

  private parsePlaceholder(): MessageElement {
    const loc = this.locHere();
    this.expect('{');
    this.skipWs();
    const name = this.parseIdentifier();
    this.skipWs();

    if (this.peek() === '}') {
      this.advance();
      return { type: 'argument', name, loc: this.closeLoc(loc) };
    }

    this.expect(',');
    this.skipWs();
    const typeName = this.parseIdentifier();
    this.skipWs();

    if (typeName === 'plural' || typeName === 'selectordinal') {
      return this.parsePlural(name, typeName, loc);
    }
    if (typeName === 'select') {
      return this.parseSelect(name, loc);
    }
    if (typeName === 'number') {
      return this.parseNumber(name, loc);
    }
    if (typeName === 'date' || typeName === 'time') {
      return this.parseDateTime(name, typeName, loc);
    }
    if (typeName === 'choice' || typeName === 'spellout' || typeName === 'ordinal' || typeName === 'duration') {
      this.fail(
        `Unsupported ICU arg type "${typeName}"`,
        'TONGUE_E_UNSUPPORTED_ICU',
      );
    }
    this.fail(`Unknown ICU arg type "${typeName}"`, 'TONGUE_E_UNSUPPORTED_ICU');
  }

  private parseNumber(name: string, loc: SourceLocation): MessageElement {
    let style: NumberStyle | undefined;
    if (this.peek() === ',') {
      this.advance();
      this.skipWs();
      const styleTok = this.parseStyleToken();
      style = this.normalizeNumberStyle(styleTok);
      this.skipWs();
    }
    this.expect('}');
    return style != null
      ? { type: 'number', name, style, loc: this.closeLoc(loc) }
      : { type: 'number', name, loc: this.closeLoc(loc) };
  }

  private parseDateTime(
    name: string,
    kind: 'date' | 'time',
    loc: SourceLocation,
  ): MessageElement {
    let style: DateTimeStyle | undefined;
    if (this.peek() === ',') {
      this.advance();
      this.skipWs();
      const styleTok = this.parseStyleToken();
      style = this.normalizeDateStyle(styleTok);
      this.skipWs();
    }
    this.expect('}');
    if (kind === 'date') {
      return style != null
        ? { type: 'date', name, style, loc: this.closeLoc(loc) }
        : { type: 'date', name, loc: this.closeLoc(loc) };
    }
    return style != null
      ? { type: 'time', name, style, loc: this.closeLoc(loc) }
      : { type: 'time', name, loc: this.closeLoc(loc) };
  }

  private parsePlural(
    name: string,
    kind: 'plural' | 'selectordinal',
    loc: SourceLocation,
  ): MessageElement {
    let offset = 0;
    if (this.peek() === ',') {
      this.advance();
      this.skipWs();
    }
    if (this.peekStarts('offset:')) {
      this.consume('offset:');
      this.skipWs();
      offset = this.parseNumberLiteral();
      this.skipWs();
    }

    const options: PluralBranch[] = [];
    let hasOther = false;
    this.inPluralContext++;
    try {
      while (!this.eof() && this.peek() !== '}') {
        this.skipWs();
        if (this.peek() === '}') break;
        const optLoc = this.locHere();
        let selector: PluralBranch['selector'];
        if (this.peek() === '=') {
          this.advance();
          const n = this.parseNumberLiteral();
          selector = `=${n}`;
        } else {
          const cat = this.parseIdentifier();
          if (!PLURAL_CATS.has(cat)) {
            this.fail(`Invalid plural category "${cat}"`, 'TONGUE_E_PARSE');
          }
          selector = cat as PluralCategory;
          if (cat === 'other') hasOther = true;
        }
        this.skipWs();
        this.expect('{');
        const value = this.parseMessage();
        this.expect('}');
        options.push({ selector, value, loc: this.closeLoc(optLoc) });
        this.skipWs();
      }
    } finally {
      this.inPluralContext--;
    }
    if (!hasOther) {
      this.fail('plural/selectordinal requires an `other` branch', 'TONGUE_E_PARSE');
    }
    this.expect('}');
    return { type: kind, name, offset, options, loc: this.closeLoc(loc) };
  }

  private parseSelect(name: string, loc: SourceLocation): MessageElement {
    if (this.peek() === ',') {
      this.advance();
      this.skipWs();
    }
    const options: SelectBranch[] = [];
    let hasOther = false;
    while (!this.eof() && this.peek() !== '}') {
      this.skipWs();
      if (this.peek() === '}') break;
      const optLoc = this.locHere();
      const selector = this.parseIdentifier();
      if (selector === 'other') hasOther = true;
      this.skipWs();
      this.expect('{');
      const value = this.parseMessage();
      this.expect('}');
      options.push({ selector, value, loc: this.closeLoc(optLoc) });
      this.skipWs();
    }
    if (!hasOther) {
      this.fail('select requires an `other` branch', 'TONGUE_E_PARSE');
    }
    this.expect('}');
    return { type: 'select', name, options, loc: this.closeLoc(loc) };
  }

  private parseTagOrLiteral(): MessageElement {
    const loc = this.locHere();
    // Lookahead: <Name> or <Name/> or </Name> or plain <
    if (!/^<[A-Za-z]/.test(this.src.slice(this.i))) {
      // treat as literal
      this.advance();
      return { type: 'literal', value: '<', loc: this.closeLoc(loc) };
    }
    this.expect('<');
    if (this.peek() === '/') {
      this.fail('Unexpected closing tag', 'TONGUE_E_PARSE');
    }
    const name = this.parseIdentifier();
    this.skipWs();
    if (this.peek() === '/' && this.src[this.i + 1] === '>') {
      this.advance();
      this.advance();
      return {
        type: 'tag',
        name,
        children: [],
        selfClosing: true,
        loc: this.closeLoc(loc),
      };
    }
    this.expect('>');
    const children = this.parseMessage(`</${name}>`);
    this.consume(`</${name}>`);
    return {
      type: 'tag',
      name,
      children,
      selfClosing: false,
      loc: this.closeLoc(loc),
    };
  }

  private normalizeNumberStyle(tok: string): NumberStyle {
    if (tok.startsWith('::')) {
      const skeleton = tok.slice(2);
      const parts = skeleton.split('/').length > 1 ? [skeleton] : skeleton.split(/\s+/);
      for (const part of parts.length ? parts : [skeleton]) {
        if (!SUPPORTED_NUMBER_SKELETONS.some((re) => re.test(part))) {
          // also allow multi-token skeletons joined
          if (!SUPPORTED_NUMBER_SKELETONS.some((re) => re.test(skeleton))) {
            this.fail(
              `Unsupported number skeleton "${skeleton}"`,
              'TONGUE_E_UNSUPPORTED_ICU',
            );
          }
        }
      }
      return { skeleton };
    }
    if (NUMBER_STYLES.has(tok)) return tok as 'integer' | 'percent' | 'currency';
    return { preset: tok };
  }

  private normalizeDateStyle(tok: string): DateTimeStyle {
    if (tok.startsWith('::')) {
      return { skeleton: tok.slice(2) };
    }
    if (DATE_STYLES.has(tok)) return tok as 'short' | 'medium' | 'long' | 'full';
    return { preset: tok };
  }

  private parseStyleToken(): string {
    if (this.peekStarts('::')) {
      this.consume('::');
      let skel = '';
      while (!this.eof() && this.peek() !== '}' && this.peek() !== ',') {
        skel += this.peek();
        this.advance();
      }
      return `::${skel.trim()}`;
    }
    return this.parseIdentifier();
  }

  // —— low-level ——

  private parseIdentifier(): string {
    const start = this.i;
    if (!/[A-Za-z_$]/.test(this.peek() ?? '')) {
      this.fail('Expected identifier', 'TONGUE_E_PARSE');
    }
    this.advance();
    while (/[A-Za-z0-9_$]/.test(this.peek() ?? '')) this.advance();
    return this.src.slice(start, this.i);
  }

  private parseNumberLiteral(): number {
    const start = this.i;
    if (this.peek() === '-') this.advance();
    if (!/\d/.test(this.peek() ?? '')) {
      this.fail('Expected number', 'TONGUE_E_PARSE');
    }
    while (/\d/.test(this.peek() ?? '')) this.advance();
    return Number(this.src.slice(start, this.i));
  }

  private skipWs(): void {
    while (/\s/.test(this.peek() ?? '')) this.advance();
  }

  private peek(): string | undefined {
    return this.src[this.i];
  }

  private peekStarts(s: string): boolean {
    return this.src.startsWith(s, this.i);
  }

  private advance(): void {
    this.i++;
  }

  private eof(): boolean {
    return this.i >= this.src.length;
  }

  private expect(ch: string): void {
    if (this.peek() !== ch) {
      this.fail(`Expected '${ch}'`, 'TONGUE_E_PARSE');
    }
    this.advance();
  }

  private consume(s: string): void {
    if (!this.peekStarts(s)) {
      this.fail(`Expected "${s}"`, 'TONGUE_E_PARSE');
    }
    this.i += s.length;
  }

  private locHere(): SourceLocation {
    const { line, column } = offsetToLineCol(this.src, this.i);
    return { start: this.i, end: this.i, line, column };
  }

  private closeLoc(loc: SourceLocation): SourceLocation {
    return { ...loc, end: this.i };
  }

  private fail(message: string, code: 'TONGUE_E_PARSE' | 'TONGUE_E_UNSUPPORTED_ICU'): never {
    const { line, column } = offsetToLineCol(this.src, this.i);
    const loc: { file?: string; key?: string; line: number; column: number } = {
      line,
      column,
    };
    if (this.file != null) loc.file = this.file;
    if (this.key != null) loc.key = this.key;
    throw new TongueError(code, message, loc);
  }
}

export function offsetToLineCol(
  source: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}
