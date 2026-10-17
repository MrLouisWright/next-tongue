import type { ReactNode } from 'react';

export type MessageFn = (locale: string, values?: Record<string, unknown>) => string;

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
    // v0.1: tags are stripped at compile for t(); rich uses the same string result
    // until the rich emitter lands. Apps should prefer server getT + props.
    return t(key, values);
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
