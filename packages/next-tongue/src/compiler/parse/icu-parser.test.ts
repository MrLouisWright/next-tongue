import { describe, expect, it } from 'vitest';
import { parseMessage } from './icu-parser.js';
import { collectArgs, type PluralElement } from '../ast.js';
import { TongueError } from '../../errors.js';

describe('parseMessage', () => {
  it('parses plain text', () => {
    expect(parseMessage('Hello')).toEqual([
      expect.objectContaining({ type: 'literal', value: 'Hello' }),
    ]);
  });

  it('parses simple arguments', () => {
    const ast = parseMessage('Hello {name}!');
    expect(ast.map((e) => e.type)).toEqual(['literal', 'argument', 'literal']);
    expect(collectArgs(ast)).toEqual({ name: { kind: 'string' } });
  });

  it('parses plurals with offset and exact', () => {
    const ast = parseMessage(
      '{count, plural, offset:1 =0 {none} one {# item} other {# items}}',
    );
    expect(ast[0]?.type).toBe('plural');
    if (ast[0]?.type === 'plural') {
      expect(ast[0].offset).toBe(1);
      expect(ast[0].options.map((o) => o.selector)).toEqual(['=0', 'one', 'other']);
    }
    expect(collectArgs(ast).count).toEqual({ kind: 'number' });
  });

  it('parses select', () => {
    const ast = parseMessage(
      '{gender, select, female {She} male {He} other {They}}',
    );
    expect(ast[0]?.type).toBe('select');
    expect(collectArgs(ast).gender).toEqual({
      kind: 'select',
      options: ['female', 'male'],
    });
  });

  it('parses rich tags', () => {
    const ast = parseMessage('Read <b>this</b>');
    expect(ast[0]?.type).toBe('literal');
    expect(ast[1]?.type).toBe('tag');
    if (ast[1]?.type === 'tag') {
      expect(ast[1].name).toBe('b');
      expect(ast[1].selfClosing).toBe(false);
    }
  });

  it('parses self-closing tags', () => {
    const ast = parseMessage('Line<br/>break');
    expect(ast.some((e) => e.type === 'tag' && e.selfClosing)).toBe(true);
  });

  it('handles apostrophe escaping', () => {
    const ast = parseMessage("'{'literal'}'");
    expect(ast).toEqual([
      expect.objectContaining({ type: 'literal', value: '{literal}' }),
    ]);
    expect(parseMessage("it''s")[0]).toEqual(
      expect.objectContaining({ value: "it's" }),
    );
  });

  describe('apostrophes (1.0.6)', () => {
    const text = (src: string) =>
      parseMessage(src)
        .map((e) => (e.type === 'literal' ? e.value : e.type === 'argument' ? `{${e.name}}` : `<${e.type}>`))
        .join('');

    it("keeps the argument after an elision: d'un {email}", () => {
      const ast = parseMessage("Rebreu un codi a l'adreça d'un {email}.");
      expect(collectArgs(ast)).toEqual({ email: { kind: 'string' } });
      expect(text("d'un {email}")).toBe("d'un {email}");
    });

    it('treats French/Catalan/Italian elisions as plain apostrophes', () => {
      expect(text("L'application s'est fermée pour {name}")).toBe("L'application s'est fermée pour {name}");
      // An apostrophe right before { still quotes (ICU rule); write l''{app} to keep the argument.
      expect(collectArgs(parseMessage("Benvingut a l''{app}, {name}"))).toEqual({ app: { kind: 'string' }, name: { kind: 'string' } });
      expect(text("l'{app}' {name}")).toBe('l{app} {name}');
      expect(text("Un'altra volta, {name}: c'è un messaggio")).toBe("Un'altra volta, {name}: c'è un messaggio");
      expect(text("trailing '")).toBe("trailing '");
    });

    it("keeps '' as an escaped apostrophe, also inside quoted text", () => {
      expect(text("aujourd''hui {n}")).toBe("aujourd'hui {n}");
      expect(text("'{it''s}' {x}")).toBe("{it's} {x}");
    });

    it("quotes '# only inside a plural", () => {
      const ast = parseMessage("{n, plural, one {# fichier d'aujourd'hui} other {'#' n'est pas {n}}}");
      const plural = ast[0] as PluralElement;
      const one = plural.options.find((o) => o.selector === 'one')!.value;
      const other = plural.options.find((o) => o.selector === 'other')!.value;
      expect(one[0].type).toBe('pound');
      expect(one.map((e) => (e.type === 'literal' ? e.value : '#')).join('')).toBe("# fichier d'aujourd'hui");
      expect(other[0]).toEqual(expect.objectContaining({ type: 'literal', value: "# n'est pas " }));
      expect(text("Ticket '#'1")).toBe("Ticket '#'1");
    });
  });

  it('treats angle-bracket placeholders as tags unless apostrophe-escaped', () => {
    expect(() => parseMessage('data-ns="<id>.<signature>"')).toThrow(/TONGUE_E_PARSE|Expected/);
    const escaped = parseMessage("data-ns=\"'<id>.<signature>'\"");
    expect(escaped.some((e) => e.type === 'literal' && e.value.includes('<id>'))).toBe(
      true,
    );
  });

  it('reports file:key:line:col on error', () => {
    try {
      parseMessage('Hello {name', { file: 'en.json', key: 'home.title' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TongueError);
      const e = err as TongueError;
      expect(e.message).toMatch(/en\.json:home\.title:\d+:\d+/);
    }
  });

  it('rejects unsupported choice', () => {
    expect(() => parseMessage('{n, choice, 0#none|1#one}')).toThrow(
      /TONGUE_E_UNSUPPORTED_ICU|Unsupported/,
    );
  });

  it('rejects unsupported number skeletons', () => {
    expect(() => parseMessage('{n, number, ::scientific}')).toThrow(
      /UNSUPPORTED|Unsupported/,
    );
  });

  it('accepts supported number skeletons', () => {
    expect(() => parseMessage('{n, number, ::percent}')).not.toThrow();
    expect(() => parseMessage('{n, number, ::currency/EUR}')).not.toThrow();
  });
});
