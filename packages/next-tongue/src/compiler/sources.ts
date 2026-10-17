import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ResolvedTongueConfig } from '../config/types.js';
import { TongueError } from '../errors.js';
import type { LocaleCatalogs } from './load-messages.js';

export type SourcePayload = Record<
  string,
  Record<string, Record<string, string>>
>;

export function assertSourceShape(
  value: unknown,
  label: string,
): SourcePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TongueError(
      'TONGUE_E_CONFIG',
      `sources[${label}] must return { locale: { namespace: { key: string } } }`,
    );
  }
  const out: SourcePayload = {};
  for (const [locale, nsMap] of Object.entries(value as Record<string, unknown>)) {
    if (!nsMap || typeof nsMap !== 'object' || Array.isArray(nsMap)) {
      throw new TongueError(
        'TONGUE_E_CONFIG',
        `sources[${label}].${locale} must be an object of namespaces`,
      );
    }
    out[locale] = {};
    for (const [ns, keys] of Object.entries(nsMap as Record<string, unknown>)) {
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
        throw new TongueError(
          'TONGUE_E_CONFIG',
          `sources[${label}].${locale}.${ns} must be an object of string messages`,
        );
      }
      out[locale]![ns] = {};
      for (const [key, msg] of Object.entries(keys as Record<string, unknown>)) {
        if (typeof msg !== 'string') {
          throw new TongueError(
            'TONGUE_E_CONFIG',
            `sources[${label}].${locale}.${ns}.${key} must be a string`,
          );
        }
        out[locale]![ns]![key] = msg;
      }
    }
  }
  return out;
}

export type SourceOrigin = {
  fullKey: string;
  from: 'file' | `source:${number}`;
};

/**
 * Await config.sources, merge into catalogs (later wins), track origins for duplicate reporting.
 */
export async function loadAndMergeSources(
  config: ResolvedTongueConfig,
  cwd: string,
  catalogs: LocaleCatalogs,
): Promise<{
  catalogs: LocaleCatalogs;
  origins: SourceOrigin[];
  usedCache: boolean;
  payloads: SourcePayload[];
}> {
  const origins: SourceOrigin[] = [];
  // Seed origins from files
  for (const [locale, nsMap] of Object.entries(catalogs)) {
    if (locale !== config.defaultLocale) continue;
    for (const [ns, keys] of Object.entries(nsMap)) {
      for (const key of Object.keys(keys)) {
        const fullKey = ns === '_root' ? key : `${ns}.${key}`;
        origins.push({ fullKey, from: 'file' });
      }
    }
  }

  if (!config.sources.length) {
    return { catalogs, origins, usedCache: false, payloads: [] };
  }

  const cachePath = resolve(cwd, config.outDir, 'sources.json');
  let mergedPayloads: SourcePayload[] = [];
  let usedCache = false;

  try {
    for (let i = 0; i < config.sources.length; i++) {
      const fn = config.sources[i]!;
      const raw = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`sources[${i}] timed out after 30s`)),
            30_000,
          ),
        ),
      ]);
      mergedPayloads.push(assertSourceShape(raw, String(i)));
    }
  } catch (err) {
    if (config.sourcesOnError === 'use-cache') {
      try {
        const cached = JSON.parse(await readFile(cachePath, 'utf8')) as SourcePayload[];
        mergedPayloads = cached;
        usedCache = true;
      } catch {
        throw new TongueError(
          'TONGUE_E_BUILD',
          `sources failed and no .tongue/sources.json cache: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      throw new TongueError(
        'TONGUE_E_BUILD',
        `sources failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Persist cache after merge — caller (build) may wipe outDir first; we write
  // again from buildMessages after mkdir. Keep payloads on the return for that.
  const next: LocaleCatalogs = structuredClone(catalogs);

  for (let i = 0; i < mergedPayloads.length; i++) {
    const payload = mergedPayloads[i]!;
    for (const [locale, nsMap] of Object.entries(payload)) {
      next[locale] ??= {};
      for (const [ns, keys] of Object.entries(nsMap)) {
        next[locale]![ns] ??= {};
        for (const [key, msg] of Object.entries(keys)) {
          const fullKey = ns === '_root' ? key : `${ns}.${key}`;
          const existing = origins.filter((o) => o.fullKey === fullKey);
          if (existing.length) {
            origins.push({ fullKey, from: `source:${i}` });
          } else {
            origins.push({ fullKey, from: `source:${i}` });
          }
          next[locale]![ns]![key] = msg;
        }
      }
    }
  }

  return { catalogs: next, origins, usedCache, payloads: mergedPayloads };
}

export async function writeSourcesCache(
  cwd: string,
  outDir: string,
  payloads: SourcePayload[],
): Promise<void> {
  const cachePath = resolve(cwd, outDir, 'sources.json');
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(payloads, null, 2), 'utf8');
}

/** Keys that appear in more than one origin (file + source, or multiple sources). */
export function duplicateSourceKeys(origins: SourceOrigin[]): string[] {
  const counts = new Map<string, Set<string>>();
  for (const o of origins) {
    const set = counts.get(o.fullKey) ?? new Set();
    set.add(o.from);
    counts.set(o.fullKey, set);
  }
  return [...counts.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([k]) => k)
    .sort();
}

export function sourcesCachePath(cwd: string, outDir: string): string {
  return join(resolve(cwd, outDir), 'sources.json');
}
