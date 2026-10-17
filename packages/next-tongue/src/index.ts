/**
 * next-tongue public types registry.
 * Apps augment `TongueRegister` via `.tongue/types.d.ts` (codegen).
 */
export interface TongueRegister {
  locales: string;
  ns: Record<string, Record<string, Record<string, unknown>>>;
  pathnames: string;
}

export type Locale = TongueRegister['locales'];
export type Namespace = keyof TongueRegister['ns'] & string;
export type MessageKey<N extends Namespace = Namespace> = keyof TongueRegister['ns'][N] &
  string;
export type MessageArgs<
  K extends string,
  N extends Namespace = Namespace,
> = K extends MessageKey<N> ? TongueRegister['ns'][N][K] : never;

export type { TongueConfig, ResolvedTongueConfig } from './config/types.js';
export { defineConfig } from './config/define-config.js';
export { TongueError } from './errors.js';
export type { TongueErrorCode } from './errors.js';
