import { describe, expect, it } from 'vitest';
import { splitLeadingDirectives, transformCallSites } from './loader.js';

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
    expect(code).toContain('__tongueDevLoaded');
  });

  it('keeps "use client" before injected imports', () => {
    const src = `"use client";

import { useT } from 'next-tongue/client';
export function Badge() {
  const t = useT('home');
  return t('title');
}
`;
    const { code } = transformCallSites(src, 'badge.tsx');
    const clientIdx = code.indexOf('"use client"');
    const importIdx = code.indexOf('#tongue/msg/');
    expect(clientIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeGreaterThan(clientIdx);
    expect(code.trimStart().startsWith('"use client"')).toBe(true);
  });

  it('rewrites t.dynamic({ from }) to a key map of imports', () => {
    const src = `"use client";
import { useT } from 'next-tongue/client';
export function Auth({ mode }) {
  const t = useT('auth');
  return t.dynamic(mode, { from: ['btnSignIn', 'btnSignUp'] });
}
`;
    const { code, warnings } = transformCallSites(src, 'auth.tsx');
    expect(warnings).toHaveLength(0);
    expect(code.trimStart().startsWith('"use client"')).toBe(true);
    expect(code).toContain('#tongue/msg/auth/btnSignIn.js');
    expect(code).toContain('#tongue/msg/auth/btnSignUp.js');
    expect(code).toContain('__tongue_dyn');
    expect(code).not.toMatch(/t\.dynamic\s*\(/);
  });

  it('rewrites AuthForm-style btnKey + inline from array', () => {
    const src = `"use client";
import { useT } from 'next-tongue/client';
const BTN_KEYS = { in: 'btnSignIn', up: 'btnSignUp', forgot: 'btnForgot', reset: 'btnReset' };
export function AuthForm({ mode }) {
  const t = useT('auth');
  const btnKey = BTN_KEYS[mode];
  return t.dynamic(btnKey, { from: ["btnSignIn", "btnSignUp", "btnForgot", "btnReset"] });
}
`;
    const { code } = transformCallSites(src, 'auth-form.tsx');
    expect(code).toContain('#tongue/msg/auth/btnForgot.js');
    expect(code).toContain('__tongue_dyn[btnKey]');
    expect(code).not.toMatch(/t\.dynamic\s*\(/);
  });

  it('rewrites from: same-file const array', () => {
    const src = `
import { useT } from 'next-tongue/client';
const BTN_FROM = ['btnSignIn', 'btnSignUp'] as const;
export function Auth({ mode }) {
  const t = useT('auth');
  return t.dynamic(mode, { from: BTN_FROM });
}
`;
    const { code } = transformCallSites(src, 'auth-const.tsx');
    expect(code).toContain('#tongue/msg/auth/btnSignIn.js');
    expect(code).toContain('#tongue/msg/auth/btnSignUp.js');
    expect(code).not.toMatch(/t\.dynamic\s*\(/);
  });

  it('rewrites from: Object.values(same-file const object)', () => {
    const src = `
import { useT } from 'next-tongue/client';
const BTN_KEYS = { in: 'btnSignIn', up: 'btnSignUp' } as const;
export function Auth({ mode }) {
  const t = useT('auth');
  return t.dynamic(BTN_KEYS[mode], { from: Object.values(BTN_KEYS) });
}
`;
    const { code } = transformCallSites(src, 'auth-ov.tsx');
    expect(code).toContain('#tongue/msg/auth/btnSignIn.js');
    expect(code).toContain('#tongue/msg/auth/btnSignUp.js');
    expect(code).not.toMatch(/t\.dynamic\s*\(/);
  });

  it('leaves t.dynamic as stub when from is not resolvable in-file', () => {
    const src = `
import { useT } from 'next-tongue/client';
import { BTN_FROM } from './keys';
export function Auth({ mode }) {
  const t = useT('auth');
  return t.dynamic(mode, { from: BTN_FROM });
}
`;
    const { code } = transformCallSites(src, 'auth-import.tsx');
    expect(code).toMatch(/t\.dynamic\s*\(/);
    expect(code).not.toContain('#tongue/msg/');
  });

  it('rewrites t.rich() to per-key .rich calls', () => {
    const src = `
import { useT } from 'next-tongue/client';
export function Terms() {
  const t = useT('legal');
  return t.rich('terms', { link: (c) => c });
}
`;
    const { code, warnings } = transformCallSites(src, 'terms.tsx');
    expect(warnings).toHaveLength(0);
    expect(code).toContain("#tongue/msg/legal/terms.js");
    expect(code).toMatch(/__tongue_legal_terms\.rich\(__tongue_locale/);
  });

  it('warns when t escapes', () => {
    const src = `
const t = useT('home');
return t;
`;
    const { warnings } = transformCallSites(src, 'x.tsx');
    expect(warnings.some((w) => w.includes('TONGUE_W_ESCAPE'))).toBe(true);
    expect(warnings.some((w) => w.includes('escapes'))).toBe(true);
  });
});

describe('splitLeadingDirectives', () => {
  it('peels use client and leaves the body', () => {
    const { directives, body } = splitLeadingDirectives(
      `"use client";\n\nimport x from 'y';\n`,
    );
    expect(directives).toContain('"use client"');
    expect(body.trimStart().startsWith('import')).toBe(true);
  });
});
