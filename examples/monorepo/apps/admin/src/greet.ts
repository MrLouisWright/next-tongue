import type { MessageKey } from 'next-tongue';

/** Portable public type — must not drag internal paths (TS2742). */
export type HomeKey = MessageKey<'home'>;

export function assertHomeKey(key: HomeKey): HomeKey {
  return key;
}
