import { describe, expect, it } from 'vitest';
import { formatDoneSummary } from './update.js';
import { renderChanges, renderChangesSummary, type KeyChange } from './review.js';

const ch = (locale: string, n: number): KeyChange[] => Array.from({ length: n }, (_, i) => ({ locale, key: `k${i}`, kind: 'added' as const, after: `v${i}` }));
const strip = (s: string) => s.replaceAll(String.fromCharCode(27), "");

describe('1.0.3 update output', () => {
  it('collapses the diff per locale with "and N more"', () => {
    const out = renderChangesSummary([...ch('de', 10), ...ch('fr', 2)]);
    expect(out).toContain('de 10 added: + k0, + k1, + k2 and 7 more');
    expect(out).toContain('fr 2 added: + k0, + k1');
    expect(out).not.toContain('+ v0');
    expect(out).toContain('--verbose');
    expect(renderChanges(ch('de', 2))).toContain('+ v0');
  });

  it('prints a success summary with counts, usage, files and next step', () => {
    const out = formatDoneSummary({
      summary: { translated: 5980, failed: [], removed: 0, pulled: 0, billedChars: 1200, plannedChars: 9000, files: ['messages/de.json', 'messages/fr.json'], changes: [...ch('de', 2990), ...ch('fr', 2990)] },
      startedAt: 0,
      now: 134_000,
      estimate: { chars: 9000, billableChars: 1200, costGBP: 0.5, allowanceRemaining: 10000 },
      lockPath: 'tongue.lock',
    });
    expect(out).toContain('✔ Done — translated 5,980 strings into 2 languages in 2m 14s');
    expect(out).toContain('de 2,990 · fr 2,990');
    expect(out).toContain('7,800 chars from allowance (2,200 left)');
    expect(out).toContain('~£0.50 credit');
    expect(out).toContain('Wrote 2 file(s) + tongue.lock');
    expect(out).toContain('git diff');
  });

  it('keeps failures visible and has no colour codes under NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    const out = formatDoneSummary({ summary: { translated: 1, failed: [{ locale: 'it', key: 'a', reason: 'x' }], removed: 0, pulled: 0, billedChars: 0, plannedChars: 0, files: [], changes: ch('de', 1) }, startedAt: 0, now: 5000 });
    delete process.env.NO_COLOR;
    expect(out).toBe(strip(out)); // no ESC chars
    expect(out).toContain('Done with errors');
    expect(out).toContain('re-run');
  });
});
