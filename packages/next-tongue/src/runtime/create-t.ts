import type { ReactNode } from 'react';
import type { MessageArgs, MessageKey, Namespace } from '../index.js';

export type MessageFn = ((
  locale: string,
  values?: Record<string, unknown>,
) => string) & {
  rich?: (locale: string, values?: Record<string, unknown>) => ReactNode;
  /** Dev-only key id (stripped in production builds). */
  __tongueKey?: string;
  /** Dev-only `file:line` for overlay click-to-key. */
  __tongueSrc?: string;
  /** Dev-only map of locale → fallback source locale. */
  __tongueFallback?: Record<string, string>;
};

type ArgsFor<N extends Namespace, K extends MessageKey<N>> = MessageArgs<K, N>;

export type TFunction<N extends Namespace = Namespace> = {
  <K extends MessageKey<N>>(
    key: K,
    ...args: [ArgsFor<N, K>] extends [never]
      ? [values?: Record<string, never>]
      : Record<string, never> extends ArgsFor<N, K>
        ? [values?: ArgsFor<N, K>]
        : [values: ArgsFor<N, K>]
  ): string;
  rich: <K extends MessageKey<N>>(
    key: K,
    ...args: [ArgsFor<N, K>] extends [never]
      ? [values?: Record<string, never>]
      : Record<string, never> extends ArgsFor<N, K>
        ? [values?: ArgsFor<N, K>]
        : [values: ArgsFor<N, K>]
  ) => ReactNode;
  has: (key: string) => boolean;
  /**
   * Non-literal key from a declared set. `key` is narrowed to `From[number]`
   * when `from` is a `as const` / readonly tuple of known keys.
   */
  dynamic: <const From extends readonly MessageKey<N>[]>(
    key: From[number],
    opts: { from: From },
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

function reportDevUse(fn: MessageFn | undefined, key: string, locale: string, text: string) {
  if (process.env.NODE_ENV === 'production') return;
  // Dynamic import kept sync-free: registry is light enough to static-import via
  // a side-effect function injected by the client overlay gate. Server paths use
  // optional global hook so we avoid pulling the client module into server graphs.
  const hook = (
    globalThis as typeof globalThis & {
      __tongueDevReport?: (e: {
        fullKey: string;
        locale: string;
        text: string;
        src?: string;
        fallbackFrom?: string;
        missing?: boolean;
      }) => void;
    }
  ).__tongueDevReport;
  if (!hook) return;
  if (!fn) {
    hook({ fullKey: key, locale, text: key, missing: true });
    return;
  }
  const fullKey = fn.__tongueKey ?? key;
  const fallbackFrom = fn.__tongueFallback?.[locale];
  hook({
    fullKey,
    locale,
    text,
    ...(fn.__tongueSrc ? { src: fn.__tongueSrc } : {}),
    ...(fallbackFrom ? { fallbackFrom } : {}),
  });
}

export function createT(options: CreateTOptions): TFunction {
  const { locale, messages } = options;

  const t = ((key: string, values?: Record<string, unknown>) => {
    const fn = messages[key];
    if (!fn) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[next-tongue] Missing key "${key}" for locale "${locale}"`);
        reportDevUse(undefined, key, locale, key);
      }
      return key;
    }
    const text = fn(locale, values);
    if (process.env.NODE_ENV !== 'production') {
      reportDevUse(fn, key, locale, text);
    }
    return text;
  }) as TFunction;

  t.has = (key) => Object.prototype.hasOwnProperty.call(messages, key);

  t.rich = ((key: string, values?: Record<string, unknown>) => {
    const fn = messages[key];
    if (!fn) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[next-tongue] Missing key "${key}" for locale "${locale}"`);
        reportDevUse(undefined, key, locale, key);
      }
      return key;
    }
    if (typeof fn.rich === 'function') {
      const node = fn.rich(locale, values);
      if (process.env.NODE_ENV !== 'production') {
        reportDevUse(fn, key, locale, typeof node === 'string' ? node : key);
      }
      return node;
    }
    const text = fn(locale, values);
    if (process.env.NODE_ENV !== 'production') {
      reportDevUse(fn, key, locale, text);
    }
    return text;
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
