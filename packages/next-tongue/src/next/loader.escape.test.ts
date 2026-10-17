import { describe, expect, it } from 'vitest';
import { transformCallSites } from './loader.js';

describe('escape analysis (#11)', () => {
  it('warns when t is returned', () => {
    const { warnings, code } = transformCallSites(
      `const t = useT('home');\nreturn t;`,
      'x.tsx',
    );
    expect(warnings.some((w) => w.includes('escapes'))).toBe(true);
    expect(code).not.toContain('#tongue/msg');
  });

  it('warns when t is passed as an argument', () => {
    const { warnings } = transformCallSites(
      `const t = useT('home');\nfoo(t);`,
      'arg.tsx',
    );
    expect(warnings.some((w) => w.includes('escapes'))).toBe(true);
  });

  it('warns when t is stored on an object', () => {
    const { warnings } = transformCallSites(
      `const t = useT('home');\nconst o = { t };`,
      'obj.tsx',
    );
    expect(warnings.some((w) => w.includes('escapes'))).toBe(true);
  });

  it('warns when t is passed as a JSX prop', () => {
    const { warnings } = transformCallSites(
      `const t = useT('home');\nreturn <Child translate={t} />;`,
      'prop.tsx',
    );
    expect(warnings.some((w) => w.includes('escapes'))).toBe(true);
  });

  it('rewrites when t is only called', () => {
    const { warnings, code } = transformCallSites(
      `
import { useT } from 'next-tongue/client';
export function Badge({ count }) {
  const t = useT('home');
  return <span>{t('inbox', { count })}</span>;
}
`,
      'badge.tsx',
    );
    expect(warnings).toHaveLength(0);
    expect(code).toContain('#tongue/msg/home/inbox');
  });
});
