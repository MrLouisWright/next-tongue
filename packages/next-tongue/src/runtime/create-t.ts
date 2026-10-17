import type { ReactNode } from 'react';
import type { MessageKey, Namespace, TongueRegister } from '../index.js';

export type MessageFn = ((
  locale: string,
  values?: Record<string, unknown>,
) => string) & {
  rich?: (locale: string, values?: Record<string, unknown>) => ReactNode;
};

type ArgsFor<N extends Namespace, K extends MessageKey<N>> = TongueRegister['ns'][N][K];

export type TFunction<N extends Namespace = Namespace> = {
  <K extends MessageKey<N>>(
    key: K,
    ...args: Record<string, never> extends ArgsFor<N, K>
      ? [values?: ArgsFor<N, K>]
      : [values: ArgsFor<N, K>]
  ): string;
  rich: <K extends MessageKey<N>>(
    key: K,
    ...args: Record<string, never> extends ArgsFor<N, K>
      ? [values?: ArgsFor<N, K>]
      : [values: ArgsFor<N, K>]
  ) => ReactNode;
  has: (key: string) => boolean;
  dynamic: (
    key: string,
    opts: { from: readonly MessageKey<N>[] },
    values?: Record<string, unknown>,
  ) => string;
  ns: <N2 extends Namespace>(namespace: N2) => TFunction<N2>;
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

  t.rich = ((key: string, values?: Record<string, unknown>) => {
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
  }) as TFunction['rich'];

  t.dynamic = (key, opts, values) => {
    if (!(opts.from as readonly string[]).includes(key)) {
      throw new Error(
        `[next-tongue] t.dynamic key "${key}" is not in from: [${opts.from.join(', ')}]`,
      );
    }
    return t(key as never, values as never);
  };

  t.ns = (namespace) => {
    if (!options.loadNamespace) {
      throw new Error('[next-tongue] t.ns is not available in this context');
    }
    return createT({
      locale,
      messages: options.loadNamespace(namespace),
      loadNamespace: options.loadNamespace,
    }) as TFunction<typeof namespace>;
  };

  return t;
}
