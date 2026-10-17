import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMessage } from './icu-parser.js';
import { collectArgs } from '../ast.js';
import { TongueError } from '../../errors.js';

const root = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../../test/fixtures/icu-conformance',
);

type Fixture = {
  id: string;
  message: string;
  args?: Record<string, unknown>;
  expected?: unknown[];
  error?: string;
};

describe('ICU conformance corpus (basic)', () => {
  const fixtures = JSON.parse(
    readFileSync(join(root, 'basic.json'), 'utf8'),
  ) as Fixture[];

  for (const fix of fixtures) {
    it(fix.id, () => {
      if (fix.error) {
        try {
          parseMessage(fix.message);
          expect.fail('expected error');
        } catch (err) {
          expect(err).toBeInstanceOf(TongueError);
          expect((err as TongueError).code).toBe(fix.error);
        }
        return;
      }
      const ast = parseMessage(fix.message);
      if (fix.args) {
        expect(collectArgs(ast)).toEqual(fix.args);
      }
      if (fix.expected) {
        expect(ast.map(({ type, ...rest }) => {
          if (type === 'literal') return { type, value: (rest as { value: string }).value };
          return { type };
        })).toEqual(fix.expected);
      }
    });
  }
});
