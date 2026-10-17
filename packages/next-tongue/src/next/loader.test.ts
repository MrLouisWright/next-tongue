import { describe, expect, it } from 'vitest';
import { transformCallSites } from './loader.js';

describe('transformCallSites', () => {
  it('rewrites literal t() calls to per-key imports', () => {
    const src = `
import { useT } from 'next-tongue/client';
export function Badge({ count }) {
  const t = useT('home');
  return t('inbox', { count });
}
`;
    const { code, warnings } = transformCallSites(src, 'badge.tsx');
    expect(warnings).toHaveLength(0);
    expect(code).toContain("#tongue/msg/home/inbox.js");
    expect(code).toContain('__tongue_locale');
    expect(code).toMatch(/__tongue_home_inbox\(__tongue_locale/);
  });

  it('warns when t escapes', () => {
    const src = `
const t = useT('home');
return t;
`;
    const { warnings } = transformCallSites(src, 'x.tsx');
    expect(warnings.some((w) => w.includes('escapes'))).toBe(true);
  });
});
