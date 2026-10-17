import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMessage } from './icu-parser.js';
import { collectArgs } from '../ast.js';
import { TongueError } from '../../errors.js';
import { emitMessageFunction } from '../codegen/emit-js.js';

const root = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../../test/fixtures/icu-conformance',
);

type ParseFixture = {
  id: string;
  message: string;
  args?: Record<string, unknown>;
  expected?: unknown[];
  error?: string;
  file?: string;
  key?: string;
};

type FormatFixture = {
  id: string;
  message: string;
  locale: string;
  values: Record<string, unknown>;
  result: string;
};

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(root, name), 'utf8')) as T;
}

describe('ICU conformance corpus — parse subset', () => {
  const fixtures = [
    ...loadJson<ParseFixture[]>('basic.json'),
    ...loadJson<ParseFixture[]>('subset.json'),
  ];

  for (const fix of fixtures) {
    it(fix.id, () => {
      if (fix.error) {
        try {
          parseMessage(fix.message, {
            ...(fix.file != null ? { file: fix.file } : {}),
            ...(fix.key != null ? { key: fix.key } : {}),
          });
          expect.fail('expected error');
        } catch (err) {
          expect(err).toBeInstanceOf(TongueError);
          const e = err as TongueError;
          expect(e.code).toBe(fix.error);
          if (fix.file && fix.key) {
            expect(e.message).toMatch(
              new RegExp(`${fix.file}:${fix.key}:\\d+:\\d+`),
            );
          }
        }
        return;
      }
      const ast = parseMessage(fix.message);
      if (fix.args) {
        expect(collectArgs(ast)).toEqual(fix.args);
      }
      if (fix.expected) {
        expect(
          ast.map((el) => {
            if (el.type === 'literal') return { type: 'literal', value: el.value };
            return { type: el.type };
          }),
        ).toEqual(fix.expected);
      }
    });
  }
});

describe('ICU conformance corpus — format roundtrip', () => {
  const fixtures = loadJson<FormatFixture[]>('format.json');

  for (const fix of fixtures) {
    it(fix.id, async () => {
      const ast = parseMessage(fix.message);
      const src = emitMessageFunction('msg', ast, {
        locale: fix.locale,
        timeZone: 'UTC',
        formats: { number: {}, dateTime: {} },
      }, { withLocaleArg: false });

      // Evaluate generated function in isolation
      const fn = new Function(
        `${src.replace('export function msg', 'function msg')}\nreturn msg;`,
      )() as (values?: Record<string, unknown>) => string;

      const hasArgs = Object.keys(fix.values).length > 0 || /\{/.test(fix.message);
      const out = hasArgs ? fn(fix.values) : fn();
      expect(out).toBe(fix.result);
    });
  }
});
