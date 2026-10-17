export { defineConfig } from './define-config.js';
export { loadConfig, loadConfigFromObject } from './load-config.js';
export { resolveConfig, isValidBcp47 } from './validate.js';
export type {
  TongueConfig,
  ResolvedTongueConfig,
  StrictLevel,
  LocaleCookieConfig,
  DomainConfig,
  PseudoConfig,
  DevOverlayOption,
  ResolvedDevOverlay,
} from './types.js';
