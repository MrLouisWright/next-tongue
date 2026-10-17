#!/usr/bin/env node
/**
 * CI dependency budget (ADR 0012 / #28):
 * published package.json must have empty dependencies / optionalDependencies /
 * bundleDependencies, and peerDependencies may only contain next and react.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const errors = [];

for (const field of ['dependencies', 'optionalDependencies', 'bundleDependencies']) {
  const value = pkg[field];
  if (value && Object.keys(value).length > 0) {
    errors.push(`${field} must be empty (found: ${Object.keys(value).join(', ')})`);
  }
}

const peers = pkg.peerDependencies ?? {};
const allowed = new Set(['next', 'react']);
for (const name of Object.keys(peers)) {
  if (!allowed.has(name)) {
    errors.push(`peerDependencies may only include next and react (found: ${name})`);
  }
}

if (errors.length) {
  console.error('Dependency budget check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

console.log('Dependency budget OK (no deps beyond next/react peers).');
