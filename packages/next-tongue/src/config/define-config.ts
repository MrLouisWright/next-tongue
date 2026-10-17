import type { TongueConfig } from './types.js';

/** Identity helper for typed `tongue.config.ts`. Build-time only. */
export function defineConfig<const C extends TongueConfig>(config: C): C {
  return config;
}
