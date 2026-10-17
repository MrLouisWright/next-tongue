import { resolve, sep } from 'node:path';
import { TongueError } from '../errors.js';

/**
 * Resolve `target` under `cwd` and refuse path traversal / absolute escapes.
 * Used by every CLI write path (ADR threat model / v0.9 CLI security review).
 */
export function resolveInsideProject(cwd: string, target: string): string {
  const root = resolve(cwd);
  const abs = resolve(root, target);
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (abs !== root && !abs.startsWith(prefix)) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `Refusing path outside project root: ${JSON.stringify(target)}`,
    );
  }
  return abs;
}
