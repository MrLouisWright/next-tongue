import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ResolvedTongueConfig } from '../config/types.js';
import { TongueError } from '../errors.js';

export type FlatMessages = Record<string, string>; // "ns.key" → message
export type NestedMessages = Record<string, unknown>;
export type LocaleCatalogs = Record<string, Record<string, FlatMessages>>; // locale → ns → key → msg

export function flattenMessages(
  input: NestedMessages,
  prefix = '',
): FlatMessages {
  const out: FlatMessages = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith('$description') || key === '$meta' || key.endsWith('$meta')) {
      continue;
    }
    if (key.includes('.')) {
      throw new TongueError(
        'TONGUE_E_BUILD',
        `Message keys must not contain '.': ${prefix ? prefix + '.' : ''}${key}`,
      );
    }
    const full = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      if (Object.prototype.hasOwnProperty.call(out, full)) {
        throw new TongueError(
          'TONGUE_E_BUILD',
          `Key "${full}" cannot be both a string leaf and a nested object. Rename the group (e.g. mail.*) or the leaf (e.g. emailLabel).`,
        );
      }
      Object.assign(out, flattenMessages(value as NestedMessages, full));
    } else if (typeof value === 'string') {
      const child = Object.keys(out).find((k) => k.startsWith(`${full}.`));
      if (child) {
        throw new TongueError(
          'TONGUE_E_BUILD',
          `Key "${full}" collides with nested key "${child}" — the same path cannot be a leaf and a branch. Rename one side.`,
        );
      }
      out[full] = value;
    } else {
      throw new TongueError(
        'TONGUE_E_BUILD',
        `Message value must be a string or object at ${full}`,
      );
    }
  }
  if (prefix === '') assertNoLeafBranchCollisions(out);
  return out;
}

/** Flat catalogs (e.g. after source merge) must not mix `email` and `email.x`. */
export function assertNoLeafBranchCollisions(flat: FlatMessages): void {
  const keys = Object.keys(flat);
  for (const key of keys) {
    for (const other of keys) {
      if (other.length > key.length && other.startsWith(`${key}.`)) {
        throw new TongueError(
          'TONGUE_E_BUILD',
          `Key "${key}" collides with nested key "${other}" — never use the same segment as both a leaf and a branch (e.g. contact.email + contact.email.autoSubject). Rename the group or the leaf.`,
        );
      }
    }
  }
}

/** Split "home.title" → { namespace: "home", key: "title" }. Top-level keys use namespace "". */
export function splitKey(fullKey: string): { namespace: string; key: string } {
  const i = fullKey.indexOf('.');
  if (i === -1) return { namespace: '', key: fullKey };
  return { namespace: fullKey.slice(0, i), key: fullKey.slice(i + 1) };
}

export function groupByNamespace(flat: FlatMessages): Record<string, FlatMessages> {
  const out: Record<string, FlatMessages> = {};
  for (const [full, msg] of Object.entries(flat)) {
    const { namespace, key } = splitKey(full);
    const ns = namespace || '_root';
    (out[ns] ??= {})[key.includes('.') ? key : key] = msg;
    // Keep nested keys under namespace as dotted relative keys
    if (namespace) {
      (out[namespace] ??= {})[key] = msg;
    } else {
      (out['_root'] ??= {})[full] = msg;
    }
  }
  return out;
}

function messagesPath(pattern: string, locale: string, namespace?: string): string {
  let p = pattern.replaceAll('{locale}', locale);
  if (namespace != null) p = p.replaceAll('{namespace}', namespace);
  return p;
}

export async function loadLocaleMessages(
  config: ResolvedTongueConfig,
  cwd: string,
): Promise<LocaleCatalogs> {
  const catalogs: LocaleCatalogs = {};
  const pattern = config.messages;
  const perNamespace = pattern.includes('{namespace}');

  for (const locale of config.locales) {
    catalogs[locale] = {};
    if (perNamespace) {
      // Discover namespaces from default locale directory listing is deferred;
      // for v0.1 require single-file pattern or explicit load of known files.
      throw new TongueError(
        'TONGUE_E_BUILD',
        'Per-namespace message files ({namespace}) land in a follow-up; use {locale}.json for v0.1',
      );
    }
    const rel = messagesPath(pattern, locale);
    const abs = resolve(cwd, rel);
    let raw: string;
    try {
      raw = await readFile(abs, 'utf8');
    } catch (err) {
      throw new TongueError(
        'TONGUE_E_IO',
        `Cannot read messages for ${locale}: ${abs} (${err instanceof Error ? err.message : err})`,
        { file: abs },
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new TongueError(
        'TONGUE_E_PARSE',
        `Invalid JSON: ${err instanceof Error ? err.message : err}`,
        { file: abs },
      );
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new TongueError('TONGUE_E_BUILD', 'Messages root must be an object', {
        file: abs,
      });
    }
    const flat = flattenMessages(json as NestedMessages);
    for (const [full, msg] of Object.entries(flat)) {
      const { namespace, key } = splitKey(full);
      const ns = namespace || '_root';
      const relative = namespace ? key : full;
      (catalogs[locale]![ns] ??= {})[relative] = msg;
    }
  }

  return catalogs;
}

export function resolveMessagePath(cwd: string, pattern: string, locale: string): string {
  return resolve(cwd, messagesPath(pattern, locale));
}

export { dirname, join };
