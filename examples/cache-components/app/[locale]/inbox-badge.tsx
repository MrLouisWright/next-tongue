'use client';

import { useClientT } from '../../lib/tongue-client';

export function InboxBadge({ count }: { count: number }) {
  const t = useClientT('home');
  return <span>{t('inbox', { count })}</span>;
}
