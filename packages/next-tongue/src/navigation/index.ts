/**
 * Locale-aware navigation helpers land in v0.2 (#12).
 * Re-export next/link and next/navigation names as placeholders documenting the API.
 */
export function getPathname(_args: {
  href: string;
  locale: string;
}): string {
  throw new Error(
    '[next-tongue] navigation helpers ship in v0.2. See https://github.com/MrLouisWright/next-tongue/issues/12',
  );
}
