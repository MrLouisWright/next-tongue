import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

describe('loader constraints (ADR 0001)', () => {
  it('does not use emitFile, loadModule, or importModule', () => {
    const src = readFileSync(join(here, 'loader.ts'), 'utf8')
      // Strip block/line comments so ADR mentions in docs don't false-positive
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bemitFile\s*\(/);
    expect(src).not.toMatch(/\bloadModule\s*\(/);
    expect(src).not.toMatch(/\bimportModule\s*\(/);
    expect(src).not.toMatch(/this\.emitFile\b/);
    expect(src).not.toMatch(/this\.loadModule\b/);
    expect(src).not.toMatch(/this\.importModule\b/);
  });
});
