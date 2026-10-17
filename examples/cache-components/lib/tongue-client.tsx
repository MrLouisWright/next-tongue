'use client';

import { type ReactNode } from 'react';
import { TongueProvider, useT, type MessageFn, type TFunction } from 'next-tongue/client';

/**
 * Client message map for the example until the call-site loader rewrites useT.
 * Prefer server `getT` + string props in real apps.
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

function loadNamespace(namespace: string): Record<string, MessageFn> {
  return catalogs[namespace] ?? {};
}

export function ExampleTongueProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  return (
    <TongueProvider locale={locale} loadNamespace={loadNamespace}>
      {children}
    </TongueProvider>
  );
}

export function useClientT(namespace: string): TFunction {
  return useT(namespace);
}
