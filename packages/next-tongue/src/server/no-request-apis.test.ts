import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name.name) && !name.name.includes('.test.')) {
      out.push(p);
    }
  }
  return out;
}

describe('server request-API ban (ADR 0002)', () => {
  it('never calls headers(), cookies(), or draftMode()', () => {
    // Cover server + runtime modules used by getT/getFormat
    const roots = [
      serverDir,
      join(serverDir, '../runtime'),
    ];
    const files = roots.flatMap(walk);
    const banned =
      /\b(headers|cookies|draftMode)\s*\(/;
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, file).not.toMatch(banned);
    }
  });
});
