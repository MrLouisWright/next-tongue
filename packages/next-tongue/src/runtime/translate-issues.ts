import type { MessageKey, Namespace } from '../index.js';
import type { TFunction } from './create-t.js';

/** Path segment as emitted by Standard Schema / Zod / Valibot-style validators. */
export type IssuePathSegment = PropertyKey | { readonly key: PropertyKey };

/**
 * Schema-agnostic issue shape (Standard Schema–compatible).
 * `message` is treated as a message key in the translator namespace.
 */
export type TranslateIssue = {
  message: string;
  path?: readonly IssuePathSegment[];
  params?: Record<string, unknown>;
};

export type TranslateIssuesOptions<N extends Namespace = Namespace> = {
  /** Used when `issue.message` is not a known key. */
  fallback?: MessageKey<N> & string;
  /** Override dotted-path formatting (default: join with `.`). */
  formatPath?: (path: readonly IssuePathSegment[]) => string;
};

export function defaultFormatPath(path: readonly IssuePathSegment[]): string {
  return path
    .map((seg) =>
      typeof seg === 'object' && seg !== null && 'key' in seg
        ? String(seg.key)
        : String(seg),
    )
    .join('.');
}

/**
 * Map validator issues to translated `Record<path, string[]>`.
 * Root (empty path) issues are keyed under `""`.
 */
export function translateIssues<N extends Namespace>(
  t: TFunction<N>,
  issues: readonly TranslateIssue[],
  opts?: TranslateIssuesOptions<N>,
): Record<string, string[]> {
  const formatPath = opts?.formatPath ?? defaultFormatPath;
  const out: Record<string, string[]> = {};

  for (const issue of issues) {
    const pathKey =
      issue.path && issue.path.length > 0 ? formatPath(issue.path) : '';
    const text = resolveMessage(t, issue, opts?.fallback);
    (out[pathKey] ??= []).push(text);
  }

  return out;
}

function resolveMessage<N extends Namespace>(
  t: TFunction<N>,
  issue: TranslateIssue,
  fallback: (MessageKey<N> & string) | undefined,
): string {
  const values = issue.params ?? {};
  if (t.has(issue.message)) {
    return t(issue.message as MessageKey<N> & string, values as never);
  }
  if (fallback != null && t.has(fallback)) {
    return t(fallback, { ...values, message: issue.message } as never);
  }
  return issue.message;
}
