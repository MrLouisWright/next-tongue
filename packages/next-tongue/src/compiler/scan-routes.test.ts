import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanAppRoutes } from './scan-routes.js';

describe('scanAppRoutes', () => {
  it('finds page routes under app/[locale]', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-routes-'));
    await mkdir(join(dir, 'app/[locale]/about'), { recursive: true });
    await writeFile(join(dir, 'app/[locale]/page.tsx'), 'export default function P(){}');
    await writeFile(
      join(dir, 'app/[locale]/about/page.tsx'),
      'export default function A(){}',
    );
    const routes = await scanAppRoutes(dir);
    expect(routes).toEqual(['/', '/about']);
  });
});
