export type NavigationConfig = {
  locales: readonly string[];
  defaultLocale: string;
  prefix?: 'always' | 'as-needed' | 'never';
  pathnames?: Record<string, Partial<Record<string, string>>>;
};
