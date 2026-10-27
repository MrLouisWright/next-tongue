/**
 * 1.0.5: `/sync` pushes in sequential batches (≤ 2,000 entries each), passing the cursor along, so a large
 * first sync (e.g. 8,371 rows / 1.6 MB) never hits the server's 300s gateway limit in one request.
 */
import type { LoomlocaleClient, SyncEntry } from './api.js';

export const SYNC_PUSH_BATCH = 2000;

export async function pushInBatches(
  client: Pick<LoomlocaleClient, 'sync'>,
  projectId: string,
  req: { sourceLocale: string; cursor?: string; entries: SyncEntry[]; deletedKeys?: string[] },
  opts: { batchSize?: number; onBatch?: (pushed: number, total: number) => void } = {},
): Promise<{ cursor: string | undefined; accepted: number; batches: number }> {
  const size = Math.max(1, opts.batchSize ?? SYNC_PUSH_BATCH);
  const total = req.entries.length;
  let cursor = req.cursor;
  let accepted = 0;
  let batches = 0;
  for (let i = 0; i === 0 || i < total; i += size) {
    const entries = req.entries.slice(i, i + size);
    const last = i + size >= total;
    const res = await client.sync(projectId, {
      mode: 'push',
      sourceLocale: req.sourceLocale,
      ...(cursor ? { cursor } : {}),
      entries,
      // Deletions ride on the last batch, after every entry has landed.
      ...(last && req.deletedKeys ? { deletedKeys: req.deletedKeys } : {}),
    });
    cursor = res.cursor ?? cursor;
    accepted += res.accepted ?? entries.length;
    batches++;
    opts.onBatch?.(Math.min(total, i + entries.length), total);
    if (total === 0) break;
  }
  return { cursor, accepted, batches };
}
