#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, '..', '..', 'results');
mkdirSync(resultsDir, { recursive: true });

const entry = join(root, 'src', 'client-entry.js');
writeFileSync(
  entry,
  `import { k0 } from './paraglide/messages/k0.js';
import { k1 } from './paraglide/messages/k1.js';
export function render(locale, name) {
  return k0({ name }, { locale }) + ' | ' + k1({ name }, { locale });
}
`,
);

const stubRuntime = join(root, 'src', 'runtime-stub.js');
writeFileSync(
  stubRuntime,
  `export function getLocale() { return 'en'; }
export const experimentalStaticLocale = undefined;
`,
);

async function measure(label, plugins) {
  const outfile = join(resultsDir, `paraglide-real-${label}.min.js`);
  await esbuild({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    treeShaking: true,
    plugins,
  });
  const raw = readFileSync(outfile);
  return { bytes: raw.length, bytesGz: gzipSync(raw).length, outfile };
}

/** Replace paraglide runtime with a tiny stub so message codegen is comparable to proxies. */
const stubPlugin = {
  name: 'stub-paraglide-runtime',
  setup(build) {
    build.onResolve({ filter: /runtime\.js$/ }, (args) => {
      if (args.importer.includes(`${join('paraglide', 'messages')}`) || args.path.includes('runtime')) {
        return { path: stubRuntime };
      }
    });
  },
};

const withRuntime = await measure('with-runtime', []);
const messagesOnly = await measure('messages-only', [stubPlugin]);

const report = {
  library: 'paraglide-js',
  config: '@inlang/paraglide-js compile; esbuild tree-shake of k0+k1',
  keysTotal: 500,
  keysUsed: 2,
  locales: 3,
  bytes: withRuntime.bytes,
  bytesGz: withRuntime.bytesGz,
  messagesOnlyBytes: messagesOnly.bytes,
  messagesOnlyBytesGz: messagesOnly.bytesGz,
  measuredAt: new Date().toISOString(),
  note:
    'with-runtime is the default client import (pulls Paraglide locale runtime). messagesOnly* stubs runtime.js for an apples-to-apples compare with next-tongue / proxy rows.',
};

writeFileSync(join(resultsDir, 'paraglide-real.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
