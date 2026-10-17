export type EditorPreset = 'vscode' | 'cursor' | 'webstorm' | 'idea';

/**
 * Build an editor deep-link for `file:line`.
 * `TONGUE_EDITOR` may be a preset name or a template with `{file}` and `{line}`.
 */
export function buildEditorUrl(
  file: string,
  line: number,
  editor: string = 'vscode',
): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.TONGUE_EDITOR : undefined;
  const chosen = (fromEnv && fromEnv.trim()) || editor || 'vscode';

  if (chosen.includes('{file}')) {
    return chosen
      .replaceAll('{file}', file)
      .replaceAll('{line}', String(line));
  }

  const abs = file.startsWith('/') ? file : file;
  switch (chosen as EditorPreset | string) {
    case 'cursor':
      return `cursor://file${abs.startsWith('/') ? abs : `/${abs}`}:${line}`;
    case 'webstorm':
    case 'idea':
      return `idea://open?file=${encodeURIComponent(abs)}&line=${line}`;
    case 'vscode':
    default:
      return `vscode://file${abs.startsWith('/') ? abs : `/${abs}`}:${line}`;
  }
}

export function parseSourceRef(
  src: string | undefined,
): { file: string; line: number } | null {
  if (!src) return null;
  const m = /^(.*):(\d+)$/.exec(src);
  if (!m) return null;
  return { file: m[1]!, line: Number(m[2]) };
}
