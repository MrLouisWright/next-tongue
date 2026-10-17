#!/usr/bin/env node
/**
 * Measure next-intl client/RSC message payload (precompile + narrowed catalog).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, '..', '..', 'results');
mkdirSync(resultsDir, { recursive: true });

const rscPath = join(root, '.next', 'server', 'app', 'en.rsc');
const htmlPath = join(root, '.next', 'server', 'app', 'en.html');
const rsc = readFileSync(rscPath);
const html = readFileSync(htmlPath);
const rscText = rsc.toString('utf8');

const messagesMatch = rscText.match(/"bench":\{[^}]+\}/);
const messagesSnippet = messagesMatch?.[0] ?? '';

const report = {
  library: 'next-intl',
  config: 'experimental.messages.precompile + catalog narrowed to 2 keys',
  keysTotal: 500,
  keysUsed: 2,
  locales: 3,
  rscBytes: rsc.length,
  rscBytesGz: gzipSync(rsc).length,
  htmlBytes: html.length,
  htmlBytesGz: gzipSync(html).length,
  messagesSnippetBytes: Buffer.byteLength(messagesSnippet),
  messagesSnippetBytesGz: gzipSync(Buffer.from(messagesSnippet)).length,
  leakedUnusedKeys: /Message 99|Nachricht 99/.test(rscText),
  measuredAt: new Date().toISOString(),
  note: 'RSC/HTML sizes for /en after next build. messagesSnippet* is the bench catalog fragment embedded in the RSC payload.',
};

writeFileSync(join(resultsDir, 'next-intl-app.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
