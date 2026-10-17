import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadConfig } from '../config/load-config.js';

export type ReportCliOptions = {
  cwd?: string;
  config?: string;
  json?: boolean;
  maxBytes?: number;
  quiet?: boolean;
};

export type RouteReport = {
  route: string;
  keys: string[];
  keyCount: number;
  bytes: number;
  bytesGz: number;
  namespaces: string[];
};

/** Markers emitted in compiled per-key modules / loader imports. */
const KEY_MARKERS = [
  /#tongue\/msg\/([^/"']+)\/([^/"']+)\.js/g,
  /\.tongue\/msg\/([^/"']+)\/([^/"']+)\.js/g,
  /\/msg\/([^/"']+)\/([^/"']+)\.js/g,
];

export async function cmdReport(opts: ReportCliOptions): Promise<void> {
  const { cwd } = await loadConfig({
    ...(opts.cwd != null ? { cwd: opts.cwd } : {}),
    ...(opts.config != null ? { configPath: opts.config } : {}),
  });

  const nextDir = resolve(cwd, '.next');
  try {
    await stat(nextDir);
  } catch {
    console.error('tongue report: no .next/ — run `next build` first');
    process.exitCode = 2;
    return;
  }

  const files = await collectJsFiles(nextDir);
  const byChunk = new Map<string, { keys: Set<string>; code: string }>();

  for (const file of files) {
    const code = await readFile(file, 'utf8');
    if (!code.includes('tongue') && !code.includes('.tongue/msg')) continue;
    const keys = new Set<string>();
    for (const re of KEY_MARKERS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const ns = m[1]!;
        const key = m[2]!.replace(/\.js$/, '');
        keys.add(ns === '_root' ? key : `${ns}.${key}`);
      }
    }
    if (keys.size === 0) continue;
    const rel = relative(nextDir, file);
    byChunk.set(rel, { keys, code });
  }

  // Approximate routes from app path segments in chunk names when present;
  // otherwise report per client chunk (still useful for budgets).
  const reports: RouteReport[] = [];
  for (const [chunk, { keys, code }] of byChunk) {
    const namespaces = [
      ...new Set(
        [...keys].map((k) => (k.includes('.') ? k.slice(0, k.indexOf('.')) : '_root')),
      ),
    ].sort();
    const bytes = Buffer.byteLength(extractTongueSlices(code), 'utf8');
    const bytesGz = gzipSync(Buffer.from(extractTongueSlices(code))).length;
    reports.push({
      route: guessRoute(chunk),
      keys: [...keys].sort(),
      keyCount: keys.size,
      bytes,
      bytesGz,
      namespaces,
    });
  }

  reports.sort((a, b) => a.route.localeCompare(b.route));

  if (opts.json) {
    console.log(JSON.stringify({ routes: reports }, null, 2));
  } else if (!opts.quiet) {
    if (reports.length === 0) {
      console.log('tongue report: no next-tongue message modules found in .next/');
    } else {
      for (const r of reports) {
        console.log(
          `${r.route}: ${r.keyCount} key(s), ${r.bytes} B / ${r.bytesGz} B gz — ${r.keys.join(', ')}`,
        );
      }
    }
  }

  if (opts.maxBytes != null) {
    const over = reports.filter((r) => r.bytesGz > opts.maxBytes!);
    if (over.length) {
      for (const r of over) {
        console.error(
          `tongue report: ${r.route} exceeds --max-bytes ${opts.maxBytes} (got ${r.bytesGz} B gz)`,
        );
      }
      process.exitCode = 1;
    }
  }
}

function extractTongueSlices(code: string): string {
  // Prefer substring spans that mention msg modules to avoid counting whole chunk.
  const parts: string[] = [];
  for (const re of KEY_MARKERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      parts.push(m[0]);
    }
  }
  return parts.join('\n') || code.slice(0, Math.min(code.length, 2048));
}

function guessRoute(chunkPath: string): string {
  const app = /app\/([^/_]+(?:\/[^/_]+)*)/.exec(chunkPath.replace(/\\/g, '/'));
  if (app) return `/${app[1]!.replace(/\/page$/, '') || ''}`.replace(/\/$/, '') || '/';
  return chunkPath;
}

async function collectJsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'cache' || ent.name === 'types') continue;
        await walk(abs);
      } else if (/\.(js|mjs|cjs)$/.test(ent.name)) {
        out.push(abs);
      }
    }
  }
  await walk(dir);
  return out;
}

export function parseMaxBytes(raw: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(k|kb|m|mb)?$/i.exec(raw.trim());
  if (!m) throw new Error(`Invalid --max-bytes ${JSON.stringify(raw)}`);
  const n = Number(m[1]);
  const u = (m[2] ?? '').toLowerCase();
  if (u === 'k' || u === 'kb') return Math.round(n * 1024);
  if (u === 'm' || u === 'mb') return Math.round(n * 1024 * 1024);
  return Math.round(n);
}
