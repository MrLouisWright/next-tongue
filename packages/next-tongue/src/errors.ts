export type TongueErrorCode =
  | 'TONGUE_E_CONFIG'
  | 'TONGUE_E_PARSE'
  | 'TONGUE_E_UNSUPPORTED_ICU'
  | 'TONGUE_E_TYPES_MISSING'
  | 'TONGUE_E_LOCALE'
  | 'TONGUE_E_IO'
  | 'TONGUE_E_BUILD';

export class TongueError extends Error {
  readonly code: TongueErrorCode;
  readonly file?: string;
  readonly key?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(
    code: TongueErrorCode,
    message: string,
    loc?: { file?: string; key?: string; line?: number; column?: number },
  ) {
    const prefix = formatLocation(loc);
    super(prefix ? `${prefix}: ${message}` : message);
    this.name = 'TongueError';
    this.code = code;
    if (loc?.file != null) this.file = loc.file;
    if (loc?.key != null) this.key = loc.key;
    if (loc?.line != null) this.line = loc.line;
    if (loc?.column != null) this.column = loc.column;
  }
}

function formatLocation(loc?: {
  file?: string;
  key?: string;
  line?: number;
  column?: number;
}): string | undefined {
  if (!loc) return undefined;
  const parts: string[] = [];
  if (loc.file) parts.push(loc.file);
  if (loc.key) parts.push(loc.key);
  if (loc.line != null && loc.column != null) {
    parts.push(`${loc.line}:${loc.column}`);
  } else if (loc.line != null) {
    parts.push(String(loc.line));
  }
  return parts.length ? parts.join(':') : undefined;
}
