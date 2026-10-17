export function getDir(locale: string): 'ltr' | 'rtl' {
  try {
    const loc = new Intl.Locale(locale);
    // Prefer Unicode regional indicator via Maximize when available
    const maximized = typeof loc.maximize === 'function' ? loc.maximize() : loc;
    const lang = maximized.language;
    const rtl = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'syr', 'dv', 'yi']);
    return rtl.has(lang) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

export function getOgLocale(locale: string): string {
  return locale.replace(/-/g, '_');
}

export function isLocale(value: unknown, locales: readonly string[]): value is string {
  return typeof value === 'string' && locales.includes(value);
}
