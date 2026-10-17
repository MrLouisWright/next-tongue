#!/usr/bin/env node
/**
 * Client runtime size budget (#11): next-tongue/client ≤ 2 kB min+gz
 * excluding message functions (react is external).
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist/client/index.js');
const outdir = join(root, 'dist-size');
mkdirSync(outdir, { recursive: true });

const result = await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
});

const code = result.outputFiles[0].contents;
const gz = gzipSync(code);
const bytes = code.length;
const bytesGz = gz.length;
const limit = 2048;

writeFileSync(
  join(outdir, 'client.min.js'),
  code,
);
writeFileSync(
  join(outdir, 'client-size.json'),
  JSON.stringify({ bytes, bytesGz, limit, ok: bytesGz <= limit }, null, 2),
);

console.log(
  `next-tongue/client: ${bytes} B min / ${bytesGz} B gz (limit ${limit} B gz)`,
);

if (bytesGz > limit) {
  console.error('Size budget exceeded');
  process.exit(1);
}
