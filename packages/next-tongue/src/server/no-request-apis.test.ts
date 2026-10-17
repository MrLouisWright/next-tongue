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
  it('never calls headers(), cookies(), or draftMode() outside setLocalePreference', () => {
    // Cover server + runtime modules used by getT/getFormat
    const roots = [
      serverDir,
      join(serverDir, '../runtime'),
    ];
    // locale-preference.ts is the sole allowed cookies() caller (#48).
    const allow = new Set([join(serverDir, 'locale-preference.ts')]);
    const files = roots.flatMap(walk).filter((f) => !allow.has(f));
    const banned =
      /\b(headers|cookies|draftMode)\s*\(/;
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, file).not.toMatch(banned);
    }
  });

  it('locale-preference.ts uses cookies() only via next/headers', () => {
    const src = readFileSync(join(serverDir, 'locale-preference.ts'), 'utf8');
    expect(src).toMatch(/next\/headers/);
    expect(src).toMatch(/\bcookies\s*\(/);
    expect(src).not.toMatch(/\bheaders\s*\(/);
    expect(src).not.toMatch(/\bdraftMode\s*\(/);
  });
});
