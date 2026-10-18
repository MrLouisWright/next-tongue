import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformCallSites } from '../../next/loader.js';
import { validateClientLoader } from './client-loader.js';

describe('validateClientLoader / useLocale import', () => {
  it('transformed useT output always imports useLocale', () => {
    const src = `"use client";
import { useT } from 'next-tongue/client';
export function F() {
  const t = useT('nav');
  return t('home');
}
`;
    const { code } = transformCallSites(src, 'f.tsx');
    expect(code).toMatch(/\buseLocale\b/);
    expect(code).toMatch(
      /import\s*\{[^}]*\buseLocale\b[^}]*\}\s*from\s*['"]next-tongue\/client['"]/,
    );
  });

  it('passes for a well-formed client file on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-cl-'));
    await mkdir(join(dir, 'components'), { recursive: true });
    await writeFile(
      join(dir, 'components', 'f.tsx'),
      `"use client";
import { useT } from 'next-tongue/client';
export function F() {
  const t = useT('nav');
  return t('home');
}
`,
    );
    const issues = await validateClientLoader(dir, ['components']);
    expect(issues).toHaveLength(0);
  });
});
