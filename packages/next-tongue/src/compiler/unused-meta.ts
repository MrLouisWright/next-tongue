/**
 * Catalog `$meta` flags that suppress `unused` (and extract `--prune`).
 *
 * Per key (sibling `key$meta`):
 *   { "planned": true }
 *   { "ignoreUnused": true }
 *   { "@tongue-ignore": true }
 *
 * Per namespace (child `$meta` on the namespace object):
 *   "common": { "$meta": { "planned": true }, "seeAll": "…" }
 */

export type Nested = Record<string, unknown>;

export type UnusedIgnoreIndex = {
  /** Exact full keys (e.g. `common.seeAll`). */
  keys: Set<string>;
  /** Namespace prefixes whose unused keys are ignored (`common` → `common.*`). */
  namespaces: Set<string>;
};

function metaIgnoresUnused(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const m = meta as Nested;
  if (m.planned === true) return true;
  if (m.ignoreUnused === true) return true;
  if (m['@tongue-ignore'] === true) return true;
  // Allow string form: "@tongue-ignore" or "planned"
  if (typeof m.unused === 'string') {
    const u = m.unused.toLowerCase();
    if (u === 'ignore' || u === 'planned' || u === '@tongue-ignore') return true;
  }
  return false;
}

/** Walk default-locale JSON and collect planned / @tongue-ignore markers. */
export function collectUnusedIgnores(root: Nested): UnusedIgnoreIndex {
  const keys = new Set<string>();
  const namespaces = new Set<string>();
  walk(root, '', keys, namespaces);
  return { keys, namespaces };
}

function walk(
  node: Nested,
  prefix: string,
  keys: Set<string>,
  namespaces: Set<string>,
): void {
  const nsMeta = node['$meta'];
  if (prefix && metaIgnoresUnused(nsMeta)) {
    namespaces.add(prefix);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === '$meta' || key.endsWith('$meta') || key.endsWith('$description')) {
      continue;
    }
    const full = prefix ? `${prefix}.${key}` : key;

    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      walk(value as Nested, full, keys, namespaces);
      continue;
    }
    if (typeof value !== 'string') continue;

    const meta = node[`${key}$meta`];
    if (metaIgnoresUnused(meta)) {
      keys.add(full);
    }
  }
}

export function isUnusedIgnored(
  fullKey: string,
  index: UnusedIgnoreIndex,
): boolean {
  if (index.keys.has(fullKey)) return true;
  for (const ns of index.namespaces) {
    if (fullKey === ns || fullKey.startsWith(`${ns}.`)) return true;
  }
  return false;
}

/** Glob-lite for `strict.unusedIgnore` (`common.*`, `*.seeAll`). */
export function matchesUnusedIgnoreGlob(
  fullKey: string,
  patterns: readonly string[],
): boolean {
  for (const raw of patterns) {
    const p = raw.trim();
    if (!p) continue;
    if (p === fullKey) return true;
    if (!p.includes('*')) continue;
    const re = new RegExp(
      `^${p
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    if (re.test(fullKey)) return true;
  }
  return false;
}
