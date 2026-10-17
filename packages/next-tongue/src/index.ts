/**
 * next-tongue public types registry.
 * Apps augment `TongueRegister` via `.tongue/types.d.ts` (codegen).
 *
 * Base interface is intentionally empty so generated declarations can
 * narrow `locales` / `ns` / `pathnames` via declaration merging.
 */
// Empty so apps/codegen can augment locales, ns, pathnames via merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation target
export interface TongueRegister {}

type Register = TongueRegister;

export type Locale = Register extends { locales: infer L }
  ? L
  : string;

export type Namespace = Register extends { ns: infer N }
  ? keyof N & string
  : string;

export type MessageKey<N extends Namespace = Namespace> = Register extends {
  ns: infer Ns;
}
  ? N extends keyof Ns
    ? keyof Ns[N] & string
    : string
  : string;

export type MessageArgs<
  K extends string,
  N extends Namespace = Namespace,
> = Register extends { ns: infer Ns }
  ? N extends keyof Ns
    ? K extends keyof Ns[N]
      ? Ns[N][K]
      : never
    : never
  : never;

export type Pathname = Register extends { pathnames: infer P } ? P : string;

export type { TongueConfig, ResolvedTongueConfig } from './config/types.js';
export { defineConfig } from './config/define-config.js';
export { TongueError } from './errors.js';
export type { TongueErrorCode } from './errors.js';
