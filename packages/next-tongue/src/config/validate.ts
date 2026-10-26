import type {
  DevOverlayOption,
  ResolvedDevOverlay,
  ResolvedTongueConfig,
  TongueConfig,
} from './types.js';
import { TongueError } from '../errors.js';

function resolveDevOverlay(input: DevOverlayOption | undefined): ResolvedDevOverlay {
  if (input === false) return false;
  if (input == null || input === true) return { editor: 'vscode' };
  if (typeof input === 'object') {
    const editor = input.editor ?? 'vscode';
    if (typeof editor !== 'string' || editor.length === 0 || editor.length > 500) {
      throw new TongueError(
        'TONGUE_E_CONFIG',
        '`devOverlay.editor` must be a non-empty string',
      );
    }
    return { editor };
  }
  throw new TongueError(
    'TONGUE_E_CONFIG',
    '`devOverlay` must be a boolean or `{ editor?: string }`',
  );
}

const DEFAULT_COOKIE = {
  name: 'TONGUE_LOCALE',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
  path: '/',
};

/** Loose BCP 47 check — language [-script] [-region] [-variant]* */
const BCP47 =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-[A-Za-z]{2}|\d{3})?(?:-(?:[A-Za-z\d]{5,8}|\d[A-Za-z\d]{3}))*$/;

export function isValidBcp47(tag: string): boolean {
  if (!tag || tag.length > 100) return false;
  try {
    // Intl canonicalises; throws on garbage in modern engines
    const canonical = Intl.getCanonicalLocales(tag)[0];
    return Boolean(canonical) && BCP47.test(tag);
  } catch {
    return false;
  }
}

/** IANA time zone id — validated via `Intl.DateTimeFormat`. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveConfig(input: TongueConfig): ResolvedTongueConfig {
  if (!input || typeof input !== 'object') {
    throw new TongueError('TONGUE_E_CONFIG', 'Config must be an object');
  }

  const legacy = ['baseURL', 'model', 'apiKeyEnv', 'maxTokens'].filter(
    (k) => input.translate != null && k in (input.translate as Record<string, unknown>),
  );
  if (legacy.length) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `\`translate.${legacy.join('`, `translate.')}\` were removed in next-tongue 1.0 (BYO OpenAI keys are no longer supported; translations run through Loomlocale). Remove them and run \`tongue login\`, or stay on next-tongue@0.9. See docs/migrating-to-1.0.md.`,
    );
  }
  const locales = input.locales;
  if (!Array.isArray(locales) || locales.length === 0) {
    throw new TongueError('TONGUE_E_CONFIG', '`locales` must be a non-empty array');
  }

  for (const locale of locales) {
    if (typeof locale !== 'string' || !isValidBcp47(locale)) {
      throw new TongueError(
        'TONGUE_E_CONFIG',
        `Invalid BCP 47 locale: ${JSON.stringify(locale)}`,
      );
    }
  }

  const unique = new Set(locales);
  if (unique.size !== locales.length) {
    throw new TongueError('TONGUE_E_CONFIG', '`locales` must not contain duplicates');
  }

  const { defaultLocale } = input;
  if (typeof defaultLocale !== 'string' || !locales.includes(defaultLocale)) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `\`defaultLocale\` (${JSON.stringify(defaultLocale)}) must be one of \`locales\``,
    );
  }

  const messages = input.messages ?? './messages/{locale}.json';
  if (typeof messages !== 'string' || !messages.includes('{locale}')) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      '`messages` must be a string containing `{locale}`',
    );
  }

  let pseudo: ResolvedTongueConfig['pseudo'] = false;
  if (input.pseudo === true) {
    pseudo = { locale: 'en-XA', enabled: 'dev', expand: 0.35 };
  } else if (input.pseudo && typeof input.pseudo === 'object') {
    const pl = input.pseudo.locale ?? 'en-XA';
    if (!isValidBcp47(pl)) {
      throw new TongueError(
        'TONGUE_E_CONFIG',
        `Invalid pseudo locale: ${JSON.stringify(pl)}`,
      );
    }
    if (locales.includes(pl)) {
      throw new TongueError(
        'TONGUE_E_CONFIG',
        `pseudo.locale "${pl}" must not already be in \`locales\``,
      );
    }
    const expand = input.pseudo.expand ?? 0.35;
    if (typeof expand !== 'number' || expand < 0 || expand > 3) {
      throw new TongueError(
        'TONGUE_E_CONFIG',
        '`pseudo.expand` must be a number between 0 and 3',
      );
    }
    pseudo = {
      locale: pl,
      enabled: input.pseudo.enabled ?? 'dev',
      expand,
    };
  }

  const timeZone = input.timeZone ?? 'UTC';
  if (!isValidTimeZone(timeZone)) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `Invalid IANA time zone: ${JSON.stringify(timeZone)}`,
    );
  }

  const localeCookie =
    input.routing?.localeCookie === false
      ? false
      : {
          ...DEFAULT_COOKIE,
          ...(input.routing?.localeCookie ?? {}),
        };

  return {
    locales,
    defaultLocale,
    messages,
    fallback: input.fallback ?? {},
    timeZone,
    sources: input.sources ?? [],
    sourcesOnError: input.sourcesOnError ?? 'fail',
    pseudo,
    client: { split: input.client?.split ?? 'none' },
    devOverlay: resolveDevOverlay(input.devOverlay),
    routing: {
      prefix: input.routing?.prefix ?? 'as-needed',
      localeDetection: input.routing?.localeDetection ?? true,
      localeCookie,
      domains: input.routing?.domains,
      pathnames: input.routing?.pathnames,
      rootParams: input.routing?.rootParams === true,
    },
    formats: {
      number: input.formats?.number ?? {},
      dateTime: input.formats?.dateTime ?? {},
      list: input.formats?.list ?? {},
    },
    outDir: input.outDir ?? '.tongue',
    scan: {
      include: input.scan?.include ?? [],
    },
    strict: {
      missing: input.strict?.missing ?? 'error',
      unused: input.strict?.unused ?? 'warn',
      unusedIgnore: input.strict?.unusedIgnore ?? [],
      mismatch: input.strict?.mismatch ?? 'error',
      a11y: input.strict?.a11y ?? 'error',
      bidi: input.strict?.bidi ?? 'warn',
      stale: input.strict?.stale ?? 'warn',
      length: input.strict?.length ?? 'warn',
    },
    translate: input.translate,
    cloud: input.cloud ?? {},
  };
}
