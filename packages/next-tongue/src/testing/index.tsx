import type { ReactNode } from 'react';
import { createT, type TFunction, type MessageFn } from '../runtime/create-t.js';
import { TongueProvider } from '../client/index.js';

export type CreateTestTOptions = {
  keysOnly?: boolean;
  messages?: Record<string, string | MessageFn>;
};

/**
 * Sync translator for unit tests (Vitest / Jest).
 * Pass string messages, compiled `MessageFn`s, or `keysOnly` to echo keys.
 */
export function createTestT(
  locale: string,
  _namespace = '_root',
  opts?: CreateTestTOptions,
): TFunction {
  const messages: Record<string, MessageFn> = {};
  for (const [key, value] of Object.entries(opts?.messages ?? {})) {
    if (typeof value === 'function') {
      messages[key] = value;
    } else if (opts?.keysOnly) {
      messages[key] = () => key;
    } else {
      const text = value;
      messages[key] = (_loc, values) => {
        if (!values) return text;
        return text.replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values[name] ?? ''),
        );
      };
    }
  }
  return createT({ locale, messages });
}

export function TongueTestProvider({
  locale,
  timeZone = 'UTC',
  messages,
  keysOnly,
  namespace = '_root',
  children,
}: {
  locale: string;
  timeZone?: string;
  namespace?: string;
  messages?: Record<string, string | MessageFn>;
  keysOnly?: boolean;
  children: ReactNode;
}) {
  const loadNamespace = (ns: string) => {
    if (ns !== namespace) return {};
    const opts: CreateTestTOptions = {};
    if (messages) opts.messages = messages;
    if (keysOnly != null) opts.keysOnly = keysOnly;
    const t = createTestT(locale, ns, opts);
    const out: Record<string, MessageFn> = {};
    for (const key of Object.keys(messages ?? {})) {
      out[key] = (_loc, values) => {
        if (keysOnly) return key;
        return t(key, values as never);
      };
    }
    return out;
  };

  return (
    <TongueProvider locale={locale} timeZone={timeZone} loadNamespace={loadNamespace}>
      {children}
    </TongueProvider>
  );
}
