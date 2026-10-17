declare module '*.tongue/ns/*.js' {
  export const messages: Record<
    string,
    (locale: string, values?: Record<string, unknown>) => string
  >;
  export function createT(
    locale: string,
  ): (key: string, values?: Record<string, unknown>) => string;
}

declare module '../.tongue/ns/home.js' {
  export const messages: Record<
    string,
    (locale: string, values?: Record<string, unknown>) => string
  >;
}
