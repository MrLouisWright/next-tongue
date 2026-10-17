'use client';

import { Link } from '../../lib/navigation';

export function AboutLink({ label }: { label: string }) {
  return (
    <Link href="/about" data-testid="about-link">
      {label}
    </Link>
  );
}
