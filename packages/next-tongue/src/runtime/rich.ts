import { createElement, Fragment, type ReactNode } from 'react';

/** Join rich message parts into a single ReactNode. */
export function richJoin(parts: ReactNode[]): ReactNode {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return parts;
}

/**
 * Apply a rich tag handler with a stable key (`tongue-t{index}`).
 * Missing handlers pass chunks through unchanged.
 */
export function richTag(
  handler: ((chunks: ReactNode) => ReactNode) | undefined,
  chunks: ReactNode,
  index: number,
): ReactNode {
  const node = (handler ?? ((c) => c))(chunks);
  return createElement(Fragment, { key: `tongue-t${index}` }, node);
}

/** Self-closing rich tag (`<br/>`) with a stable key. */
export function richSelf(
  handler: (() => ReactNode) | undefined,
  index: number,
): ReactNode {
  const node = (handler ?? (() => null))();
  return createElement(Fragment, { key: `tongue-t${index}` }, node);
}
