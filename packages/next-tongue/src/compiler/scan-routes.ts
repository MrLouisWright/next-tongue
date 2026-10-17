import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const PAGE_NAMES = new Set([
  'page.tsx',
  'page.ts',
  'page.jsx',
  'page.js',
  'page.mdx',
]);

/**
 * Discover App Router page routes under `app/[locale]` (no Next internals).
 * Returns internal pathnames like `/`, `/about`, `/blog/[slug]`.
 */
export async function scanAppRoutes(cwd: string): Promise<string[]> {
  const roots = [
    join(cwd, 'app', '[locale]'),
    join(cwd, 'src', 'app', '[locale]'),
  ];
  const routes = new Set<string>();

  for (const root of roots) {
    try {
      if (!(await stat(root)).isDirectory()) continue;
    } catch {
      continue;
    }
    await walk(root, root, routes);
  }

  return [...routes].sort();
}

async function walk(
  dir: string,
  localeRoot: string,
  routes: Set<string>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('(') && ent.name.endsWith(')')) {
        // Route groups — descend without adding a segment.
        await walk(abs, localeRoot, routes);
      } else {
        await walk(abs, localeRoot, routes);
      }
    } else if (PAGE_NAMES.has(ent.name)) {
      const rel = relative(localeRoot, dir).replace(/\\/g, '/');
      const path =
        !rel || rel === '.'
          ? '/'
          : `/${rel
              .split('/')
              .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
              .join('/')}`;
      routes.add(path === '/' ? '/' : path.replace(/\/+/g, '/'));
    }
  }
}
