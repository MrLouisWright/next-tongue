'use client';

import type { ReactNode } from 'react';
import { DevOverlay } from './dev-overlay.js';
import { installTongueDevReporter } from './dev-registry.js';

// Install as soon as the gate module evaluates (dev-only import graph).
installTongueDevReporter();

/**
 * Thin gate so production bundles can DCE the overlay when
 * `process.env.NODE_ENV` is defined as `"production"`.
 */
export function DevOverlayGate({
  locale,
  timeZone,
  editor,
}: {
  locale: string;
  timeZone: string;
  editor?: string;
}): ReactNode {
  return (
    <DevOverlay
      locale={locale}
      timeZone={timeZone}
      {...(editor != null ? { editor } : {})}
    />
  );
}
