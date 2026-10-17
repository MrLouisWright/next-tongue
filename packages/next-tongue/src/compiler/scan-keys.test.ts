import { describe, expect, it } from 'vitest';
import { extractFromSource } from './scan-keys.js';

describe('extractFromSource', () => {
  it('finds useT and t()/t.rich() keys', () => {
    const src = `
import { useT } from 'next-tongue/client';
export function Badge({ count }) {
  const t = useT('home');
  return <>{t('inbox', { count })}{t.rich('title', {})}</>;
}
`;
    const refs = extractFromSource(src, 'badge.tsx');
    expect(refs.map((r) => r.fullKey).sort()).toEqual([
      'home.inbox',
      'home.title',
    ]);
  });

  it('finds getT keys', () => {
    const src = `
const t = await getT('home');
return t('title', { name: 'Ada' });
`;
    const refs = extractFromSource(src, 'page.tsx');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.fullKey).toBe('home.title');
    expect(refs[0]?.line).toBe(3);
  });

  it('finds getT(locale, ns) keys', () => {
    const src = `
const t = await getT(locale, 'home');
return t('metaTitle');
`;
    const refs = extractFromSource(src, 'page.tsx');
    expect(refs.map((r) => r.fullKey)).toEqual(['home.metaTitle']);
  });
});
