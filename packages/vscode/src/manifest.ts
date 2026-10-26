import type * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type ManifestKey = {
  namespace: string;
  key: string;
  fullKey: string;
  source: string;
  byLocale?: Record<string, string>;
  line?: number;
  file?: string;
};

export type TongueManifest = {
  version: number;
  hash: string;
  locales: string[];
  defaultLocale: string;
  messages?: string;
  keys: ManifestKey[];
};

export type ManifestState = {
  root: string;
  manifestPath: string;
  manifest: TongueManifest;
  byFullKey: Map<string, ManifestKey>;
};

export function findManifestPaths(workspaceFolders: readonly vscode.WorkspaceFolder[]): string[] {
  const out: string[] = [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, '.tongue', 'manifest.json');
    if (fs.existsSync(candidate)) out.push(candidate);
    // Monorepo: one level of packages/apps
    for (const sub of ['packages', 'apps', 'examples']) {
      const dir = path.join(folder.uri.fsPath, sub);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const m = path.join(dir, name, '.tongue', 'manifest.json');
        if (fs.existsSync(m)) out.push(m);
      }
    }
  }
  return out;
}

export function loadManifest(manifestPath: string): ManifestState | undefined {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as TongueManifest;
    const byFullKey = new Map<string, ManifestKey>();
    for (const k of manifest.keys ?? []) {
      byFullKey.set(k.fullKey, k);
      // Also index bare key under namespace for t('title') after useT('home')
      byFullKey.set(`${k.namespace}::${k.key}`, k);
    }
    return {
      root: path.dirname(path.dirname(manifestPath)),
      manifestPath,
      manifest,
      byFullKey,
    };
  } catch {
    return undefined;
  }
}

/** Resolve t('key') relative to a useT/getT namespace. */
export function resolveKey(
  state: ManifestState,
  ns: string | undefined,
  key: string,
): ManifestKey | undefined {
  if (key.includes('.')) {
    return state.byFullKey.get(key);
  }
  if (ns) {
    return (
      state.byFullKey.get(`${ns}.${key}`) ??
      state.byFullKey.get(`${ns}::${key}`)
    );
  }
  return state.byFullKey.get(key);
}
