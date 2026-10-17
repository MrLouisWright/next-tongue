/**
 * Type-level coverage for docs/type-safety.md "What is checked" (ROADMAP v0.1 AC).
 * Checked via `tsc -p tsconfig.type-tests.json --noEmit` (not executed at runtime).
 */
import { expectTypeOf } from 'expect-type';
import type { ReactNode } from 'react';
import type { TFunction } from '../runtime/create-t.js';
import type { Locale, MessageKey, Namespace } from '../index.js';

/** Fixture registry matching the type-safety docs table. */
declare module 'next-tongue' {
  interface TongueRegister {
    locales: 'en' | 'de';
    ns: {
      home: {
        title: { name: string | number };
        inbox: { count: number };
      };
      legal: {
        terms: { link: (chunks: ReactNode) => ReactNode };
      };
      status: {
        ok: Record<string, never>;
        pending: Record<string, never>;
      };
    };
    pathnames: '/' | '/about' | '/blog/[slug]';
  }
}

declare const tHome: TFunction<'home'>;
declare const tLegal: TFunction<'legal'>;
declare const tStatus: TFunction<'status'>;

// Valid calls
expectTypeOf(tHome('title', { name: 'Ada' })).toEqualTypeOf<string>();
expectTypeOf(tHome('inbox', { count: 3 })).toEqualTypeOf<string>();
expectTypeOf(tStatus('ok')).toEqualTypeOf<string>();
expectTypeOf(
  tLegal.rich('terms', { link: (c: ReactNode) => c }),
).toEqualTypeOf<ReactNode>();
expectTypeOf(tStatus.dynamic('ok', { from: ['ok', 'pending'] })).toEqualTypeOf<string>();

// Key does not exist
// @ts-expect-error — unknown key
tHome('titel');

// Missing required args
// @ts-expect-error — name required
tHome('title');

// Wrong arg type
// @ts-expect-error — count must be number
tHome('inbox', { count: '3' });

// t.rich missing tag handler
// @ts-expect-error — link required
tLegal.rich('terms', {});

// t.dynamic from: must be known keys
// @ts-expect-error — typo in from
tStatus.dynamic('ok', { from: ['typo'] });

// Locale / namespace indexing
expectTypeOf<Locale>().toEqualTypeOf<'en' | 'de'>();
expectTypeOf<Namespace>().toEqualTypeOf<'home' | 'legal' | 'status'>();
expectTypeOf<MessageKey<'home'>>().toEqualTypeOf<'title' | 'inbox'>();
