/**
 * Map flattened message keys → 1-based line numbers in a JSON messages file.
 * Used for overlay click-to-key (`file:line`).
 */
export function locateMessageKeys(
  raw: string,
  flatKeys: Iterable<string>,
): Record<string, number> {
  const wanted = new Set(flatKeys);
  const out: Record<string, number> = {};
  if (wanted.size === 0) return out;

  const stack: string[] = [];
  let i = 0;
  let line = 1;

  const peek = () => raw[i];
  const advance = () => {
    const ch = raw[i++];
    if (ch === '\n') line++;
    return ch;
  };

  const skipWs = () => {
    while (i < raw.length) {
      const ch = peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') advance();
      else break;
    }
  };

  const readString = (): string => {
    advance(); // "
    let s = '';
    while (i < raw.length) {
      const ch = advance();
      if (ch === '\\') {
        const n = advance();
        s += n === 'n' ? '\n' : n === 't' ? '\t' : n === '"' ? '"' : n === '\\' ? '\\' : n ?? '';
      } else if (ch === '"') break;
      else s += ch;
    }
    return s;
  };

  const skipValue = (): void => {
    skipWs();
    const ch = peek();
    if (ch === '"') {
      readString();
      return;
    }
    if (ch === '{') {
      parseObject();
      return;
    }
    if (ch === '[') {
      advance();
      skipWs();
      while (i < raw.length && peek() !== ']') {
        skipValue();
        skipWs();
        if (peek() === ',') advance();
        skipWs();
      }
      if (peek() === ']') advance();
      return;
    }
    // number / true / false / null
    while (i < raw.length) {
      const c = peek();
      if (c === ',' || c === '}' || c === ']' || c === undefined) break;
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') break;
      advance();
    }
  };

  const parseObject = (): void => {
    advance(); // {
    skipWs();
    while (i < raw.length && peek() !== '}') {
      skipWs();
      if (peek() === '}') break;
      if (peek() !== '"') break;
      const keyLine = line;
      const key = readString();
      skipWs();
      if (peek() === ':') advance();
      skipWs();
      const isMeta =
        key.endsWith('$description') || key === '$meta' || key.endsWith('$meta');
      if (peek() === '{') {
        stack.push(key);
        parseObject();
        stack.pop();
      } else {
        if (!isMeta) {
          const full = [...stack, key].join('.');
          if (wanted.has(full) && out[full] == null) out[full] = keyLine;
        }
        skipValue();
      }
      skipWs();
      if (peek() === ',') advance();
      skipWs();
    }
    if (peek() === '}') advance();
  };

  skipWs();
  if (peek() === '{') parseObject();
  return out;
}
