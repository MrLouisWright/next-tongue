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
  // Match Next production so the overlay + key-id branches are DCE'd (#35).
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
});

const code = result.outputFiles[0].contents;
const text = Buffer.from(code).toString('utf8');
const gz = gzipSync(code);
const bytes = code.length;
const bytesGz = gz.length;
// Budget covers client hooks + translateIssues/Format re-exports; overlay is
// DCE'd under NODE_ENV=production (asserted below). Raised from 2 KiB after
// Format helpers / translateIssues landed on the client entry.
const limit = 3072;

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

// Overlay markers must not survive production DCE.
const banned = [
  'data-tongue-overlay',
  'Alt+Shift+T',
  '__tongueKey',
  'tongueDevLoaded',
];
for (const marker of banned) {
  if (text.includes(marker)) {
    console.error(`Production client bundle still contains "${marker}" (#35)`);
    process.exit(1);
  }
}
console.log('next-tongue/client: overlay markers absent (prod DCE ok)');
