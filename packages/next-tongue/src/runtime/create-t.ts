import type { ReactNode } from 'react';

export type MessageFn = ((
  locale: string,
  values?: Record<string, unknown>,
) => string) & {
  rich?: (locale: string, values?: Record<string, unknown>) => ReactNode;
};

export type TFunction = {
  (key: string, values?: Record<string, unknown>): string;
  rich: (key: string, values?: Record<string, unknown>) => ReactNode;
  has: (key: string) => boolean;
  dynamic: (
    key: string,
    opts: { from: readonly string[] },
    values?: Record<string, unknown>,
  ) => string;
  ns: (namespace: string) => TFunction;
};

export type CreateTOptions = {
  locale: string;
  messages: Record<string, MessageFn>;
  /** Optional resolver for t.ns */
  loadNamespace?: (namespace: string) => Record<string, MessageFn>;
};

export function createT(options: CreateTOptions): TFunction {
  const { locale, messages } = options;

  const t = ((key: string, values?: Record<string, unknown>) => {
    const fn = messages[key];
    if (!fn) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[next-tongue] Missing key "${key}" for locale "${locale}"`);
      }
      return key;
    }
    return fn(locale, values);
  }) as TFunction;

  t.has = (key) => Object.prototype.hasOwnProperty.call(messages, key);

  t.rich = (key, values) => {
    const fn = messages[key];
    if (!fn) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[next-tongue] Missing key "${key}" for locale "${locale}"`);
      }
      return key;
    }
    if (typeof fn.rich === 'function') {
      return fn.rich(locale, values);
    }
    return fn(locale, values);
  };

  t.dynamic = (key, opts, values) => {
    if (!opts.from.includes(key)) {
      throw new Error(
        `[next-tongue] t.dynamic key "${key}" is not in from: [${opts.from.join(', ')}]`,
      );
    }
    return t(key, values);
  };

  t.ns = (namespace) => {
    if (!options.loadNamespace) {
      throw new Error('[next-tongue] t.ns is not available in this context');
    }
    return createT({
      locale,
      messages: options.loadNamespace(namespace),
      loadNamespace: options.loadNamespace,
    });
  };

  return t;
}
