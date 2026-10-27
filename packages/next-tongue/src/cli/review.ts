/**
 * Review helpers for `tongue update`: per-key before/after diff, and
 * `--review pr` (commit dictionary changes to a new branch + open a PR).
 */
import { spawnSync } from 'node:child_process';
import { TongueError } from '../errors.js';
import { color } from '../cloud/tui.js';

export type KeyChange = {
  locale: string;
  key: string;
  kind: 'added' | 'changed' | 'removed';
  before?: string;
  after?: string;
};

export function buildChanges(
  pending: Record<string, { set: Record<string, string>; remove: string[] }>,
  current: Record<string, Record<string, string>>,
): KeyChange[] {
  const out: KeyChange[] = [];
  for (const [locale, b] of Object.entries(pending)) {
    const cur = current[locale] ?? {};
    for (const [key, after] of Object.entries(b.set)) {
      const before = cur[key];
      if (before === after) continue;
      out.push(before == null || before === '' ? { locale, key, kind: 'added', after } : { locale, key, kind: 'changed', before, after });
    }
    for (const key of b.remove) out.push({ locale, key, kind: 'removed', ...(cur[key] != null ? { before: cur[key] } : {}) });
  }
  return out.sort((a, b) => a.locale.localeCompare(b.locale) || a.key.localeCompare(b.key));
}

export function summarizeChanges(changes: KeyChange[]): { added: number; changed: number; removed: number } {
  const s = { added: 0, changed: 0, removed: 0 };
  for (const c of changes) s[c.kind]++;
  return s;
}

/** Coloured, human-readable diff (colour off when NO_COLOR is set or stdout is not a TTY). */
export function renderChanges(changes: KeyChange[]): string {
  const lines: string[] = [];
  let locale = '';
  for (const c of changes) {
    if (c.locale !== locale) {
      locale = c.locale;
      lines.push(color.bold(`${locale}`));
    }
    if (c.kind === 'added') lines.push(`  ${color.green('+')} ${c.key}\n      ${color.green(`+ ${c.after}`)}`);
    else if (c.kind === 'changed') lines.push(`  ${color.yellow('~')} ${c.key}\n      ${color.red(`- ${c.before}`)}\n      ${color.green(`+ ${c.after}`)}`);
    else lines.push(`  ${color.red('-')} ${c.key}${c.before != null ? `\n      ${color.red(`- ${c.before}`)}` : ''}`);
  }
  const s = summarizeChanges(changes);
  lines.push(color.dim(`${s.added} added, ${s.changed} changed, ${s.removed} removed`));
  return lines.join('\n');
}

/** Collapsed diff: per locale a count line plus the first `perLocale` keys and "and N more". */
export function renderChangesSummary(changes: KeyChange[], perLocale = 3): string {
  const by = new Map<string, KeyChange[]>();
  for (const c of changes) by.set(c.locale, [...(by.get(c.locale) ?? []), c]);
  const lines: string[] = [];
  for (const [l, cs] of by) {
    const s = summarizeChanges(cs);
    const parts = [s.added && `${s.added.toLocaleString('en-GB')} added`, s.changed && `${s.changed.toLocaleString('en-GB')} changed`, s.removed && `${s.removed.toLocaleString('en-GB')} removed`].filter(Boolean);
    const sign = (c: KeyChange) => (c.kind === 'added' ? color.green('+') : c.kind === 'changed' ? color.yellow('~') : color.red('-'));
    const shown = cs.slice(0, perLocale).map((c) => `${sign(c)} ${c.key}`).join(', ');
    const more = cs.length > perLocale ? color.dim(` and ${(cs.length - perLocale).toLocaleString('en-GB')} more`) : '';
    lines.push(`  ${color.bold(l)} ${parts.join(', ')}: ${shown}${more}`);
  }
  const s = summarizeChanges(changes);
  lines.push(color.dim(`${s.added} added, ${s.changed} changed, ${s.removed} removed · run with --verbose (or --diff) for the full diff`));
  return lines.join('\n');
}

/** Markdown body for the review PR. */
export function changesMarkdown(changes: KeyChange[], limit = 200): string {
  const s = summarizeChanges(changes);
  const rows = changes.slice(0, limit).map((c) => {
    const esc = (v?: string) => (v == null ? '' : `\`${v.replace(/`/g, "'").replace(/\|/g, '\\|').replace(/\n/g, ' ')}\``);
    return `| ${c.locale} | \`${c.key}\` | ${c.kind} | ${esc(c.before)} | ${esc(c.after)} |`;
  });
  return [
    `Machine translations from Loomlocale (\`tongue update --review pr\`): **${s.added} added, ${s.changed} changed, ${s.removed} removed**.`,
    '',
    '| Locale | Key | Change | Before | After |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ...(changes.length > limit ? ['', `…and ${changes.length - limit} more.`] : []),
    '',
    'Review the wording, then merge. After merging, run `tongue push` to sync accepted strings back to Loomlocale.',
  ].join('\n');
}

type Git = (args: string[], allowFail?: boolean) => { ok: boolean; out: string };

function makeGit(cwd: string, env: NodeJS.ProcessEnv): Git {
  return (args, allowFail = false) => {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    const ok = r.status === 0;
    if (!ok && !allowFail) {
      throw new TongueError('TONGUE_E_IO', `git ${args[0]} failed: ${(r.stderr || r.stdout || String(r.error ?? '')).trim()}`);
    }
    return { ok, out: (r.stdout ?? '').trim() };
  };
}

/** Parse `owner/repo` from a GitHub remote URL. */
export function repoSlugFromRemote(url: string): string | null {
  const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? m[1]! : null;
}

export type ReviewBranch = {
  base: string;
  branch: string;
  /** Commit `paths` on the review branch, push, open a PR, then switch back to `base`. */
  finish: (paths: string[], title: string, body: string) => Promise<{ url: string | null; branch: string; commit: string | null }>;
  /** Switch back without committing (on error / nothing to do). */
  abort: () => void;
};

export function startReviewBranch(opts: { cwd: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: Date; log?: (m: string) => void }): ReviewBranch {
  const env = opts.env ?? process.env;
  const git = makeGit(opts.cwd, env);
  if (!git(['rev-parse', '--is-inside-work-tree'], true).ok) {
    throw new TongueError('TONGUE_E_CONFIG', '`--review pr` needs a git repository.');
  }
  const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const branch = `tongue/update-${stamp}`;
  git(['switch', '-c', branch]);
  const log = opts.log ?? (() => {});
  return {
    base,
    branch,
    abort() {
      git(['switch', base], true);
      git(['branch', '-D', branch], true);
    },
    async finish(paths, title, body) {
      git(['add', '--', ...paths]);
      if (git(['diff', '--cached', '--quiet', '--', ...paths], true).ok) {
        this.abort();
        return { url: null, branch, commit: null };
      }
      git(['commit', '-m', title, '--', ...paths]);
      const commit = git(['rev-parse', 'HEAD']).out;
      const remote = git(['remote', 'get-url', 'origin'], true);
      let url: string | null = null;
      try {
        if (!remote.ok) {
          log(`No git remote "origin": review branch ${branch} kept locally.`);
          return { url, branch, commit };
        }
        git(['push', '-u', 'origin', branch]);
        const slug = env.GITHUB_REPOSITORY ?? repoSlugFromRemote(remote.out);
        const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
        if (token && slug) {
          const api = (env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
          const res = await (opts.fetchImpl ?? fetch)(`${api}/repos/${slug}/pulls`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'next-tongue-cli' },
            body: JSON.stringify({ title, head: branch, base, body }),
          });
          const data = (await res.json().catch(() => ({}))) as { html_url?: string; message?: string };
          if (!res.ok) throw new TongueError('TONGUE_E_IO', `Opening the PR failed (${res.status}): ${data.message ?? 'unknown error'}. Branch ${branch} was pushed.`);
          url = data.html_url ?? null;
        } else {
          const gh = spawnSync('gh', ['pr', 'create', '--title', title, '--body', body, '--base', base, '--head', branch], { cwd: opts.cwd, env, encoding: 'utf8' });
          if (gh.status === 0) url = gh.stdout.trim().split('\n').pop() ?? null;
          else log(`Pushed ${branch}; open a PR manually (set GITHUB_TOKEN or install gh to automate this).`);
        }
        return { url, branch, commit };
      } finally {
        git(['switch', base], true);
      }
    },
  };
}
