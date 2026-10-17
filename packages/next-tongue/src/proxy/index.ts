/**
 * createProxy lands in v0.2 (#9, #30). Stub keeps the export path stable.
 */
export function createProxy(_options?: {
  localeDetection?: boolean;
  resolveLocale?: (req: unknown) => string | undefined | Promise<string | undefined>;
  onLocale?: (locale: string, req: unknown) => void;
}): (req: unknown) => Promise<{ status: number }> {
  return async () => {
    throw new Error(
      '[next-tongue] createProxy ships in v0.2. See https://github.com/MrLouisWright/next-tongue/issues/9',
    );
  };
}
