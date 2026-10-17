import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../../config/validate.js';
import { buildMessages } from '../build.js';
import { safeIdent } from './emit-js.js';

describe('safeIdent', () => {
  it('suffixes reserved words', () => {
    expect(safeIdent('continue')).toBe('continue_');
    expect(safeIdent('default')).toBe('default_');
    expect(safeIdent('class')).toBe('class_');
    expect(safeIdent('inbox')).toBe('inbox');
  });
});

describe('namespace emit with reserved keys', () => {
  it('emits valid JS for key continue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-reserved-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages', 'en.json'),
      JSON.stringify({ wizard: { continue: 'Continue', back: 'Back' } }),
    );
    const config = resolveConfig({
      locales: ['en'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    await buildMessages({ config, cwd: dir, idempotent: false });

    const ns = await readFile(join(dir, '.tongue/ns/wizard.js'), 'utf8');
    expect(ns).toContain("import { continue_ } from '../msg/wizard/continue.js'");
    expect(ns).toContain('"continue": continue_');
    expect(ns).not.toMatch(/(?:^|[^_])continue:/m);

    const keyMod = await readFile(join(dir, '.tongue/msg/wizard/continue.js'), 'utf8');
    expect(keyMod).toMatch(/export function continue_/);
  });
});
