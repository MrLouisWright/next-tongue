import { createT, type TFunction, type MessageFn } from '../runtime/create-t.js';
import { TongueProvider } from '../client/index.js';

export function createTestT(
  locale: string,
  _namespace = '_root',
  opts?: {
    keysOnly?: boolean;
    messages?: Record<string, string | MessageFn>;
  },
): TFunction {
  const messages: Record<string, MessageFn> = {};
  for (const [key, value] of Object.entries(opts?.messages ?? {})) {
    if (typeof value === 'function') {
      messages[key] = value;
    } else if (opts?.keysOnly) {
      messages[key] = () => key;
    } else {
      messages[key] = () => value;
    }
  }
  return createT({ locale, messages });
}

export { TongueProvider as TongueTestProvider };
