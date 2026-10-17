'use client';

import type { Namespace } from 'next-tongue';
import { useT, type MessageFn, type TFunction } from 'next-tongue/client';

/**
 * Temporary client catalog until the Turbopack call-site loader is registered.
 * Prefer server getT + string props in real apps (ADR 0009).
 */
const catalogs: Record<string, Record<string, MessageFn>> = {
  home: {
    inbox: (locale, values) => {
      const count = Number(values?.count ?? 0);
      if (locale === 'de') {
        if (count === 0) return 'Keine Nachrichten';
        if (count === 1) return '1 Nachricht';
        return `${count} Nachrichten`;
      }
      if (count === 0) return 'No messages';
      if (count === 1) return '1 message';
      return `${count} messages`;
    },
  },
};

export function loadClientNamespace(namespace: string): Record<string, MessageFn> {
  return catalogs[namespace] ?? {};
}

export function useClientT(namespace: Namespace): TFunction {
  return useT(namespace);
}
