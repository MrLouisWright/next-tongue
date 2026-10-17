'use client';

import { useFormat } from 'next-tongue/client';
import { FIXED_INSTANT } from '../../lib/fixed-instant';

export function ClientDate() {
  const f = useFormat();
  return (
    <time
      data-testid="client-date"
      dateTime={new Date(FIXED_INSTANT).toISOString()}
    >
      {f.dateTime(FIXED_INSTANT, { dateStyle: 'medium', timeStyle: 'short' })}
    </time>
  );
}
