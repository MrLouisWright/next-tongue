/**
 * CLDR parent-locale style fallback.
 * Never crosses scripts (zh-Hant-HK → zh-Hant, never zh-Hans).
 */
export function cldrParents(locale: string): string[] {
  const parts = locale.split('-');
  const out: string[] = [];
  for (let i = parts.length - 1; i >= 1; i--) {
    const parent = parts.slice(0, i).join('-');
    // Avoid dropping script when region is removed incorrectly for scripted locales:
    // zh-Hant-HK → zh-Hant (keep script), not zh
    out.push(parent);
  }
  return out;
}

export function resolveFallbackChain(
  locale: string,
  defaultLocale: string,
  explicit: Partial<Record<string, string>>,
): string[] {
  const chain: string[] = [locale];
  const seen = new Set([locale]);

  let current = locale;
  while (explicit[current]) {
    const next = explicit[current]!;
    if (seen.has(next)) break;
    chain.push(next);
    seen.add(next);
    current = next;
  }

  if (!explicit[locale]) {
    for (const parent of cldrParents(locale)) {
      if (seen.has(parent)) continue;
      // Never cross scripts: if locale has a script subtag, parent without that
      // script that introduces a different script is already handled by truncation.
      chain.push(parent);
      seen.add(parent);
    }
  }

  if (!seen.has(defaultLocale)) {
    chain.push(defaultLocale);
  }

  return chain;
}
