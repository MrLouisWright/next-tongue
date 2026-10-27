/**
 * Tiny zero-dependency TUI (ADR 0012 forbids runtime deps, so no @clack).
 * Interactive mode uses raw keypresses; non-TTY mode reads one line per
 * prompt from stdin (empty line = default) so the wizard is scriptable.
 */
import * as readline from 'node:readline';

const isColor = (): boolean => process.stdout.isTTY === true && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (isColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = {
  dim: c(2),
  bold: c(1),
  cyan: c(36),
  green: c(32),
  yellow: c(33),
  red: c(31),
  magenta: c(35),
};

export type Choice<T = string> = { value: T; label: string; hint?: string };

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;
  text(message: string, opts?: { default?: string; validate?: (v: string) => string | null }): Promise<string>;
  confirm(message: string, def?: boolean): Promise<boolean>;
  select<T>(message: string, choices: Choice<T>[], def?: T): Promise<T>;
  multiselect<T>(message: string, choices: Choice<T>[], opts?: { initial?: T[]; required?: boolean }): Promise<T[]>;
  progress(label: string, total: number): Progress;
}

export type Progress = { tick(n?: number, detail?: string): void; done(message?: string): void };

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
  }
}

const bar = color.dim('│');

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');

/** Terminal cells a string occupies (ANSI stripped; East Asian wide chars and most emoji count 2). */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0)!;
    if (cp < 32 || (cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
    w +=
      (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)
        ? 2
        : 1;
  }
  return w;
}

/** Physical terminal rows `rows` occupy once soft-wrapped at `columns` (each logical line ≥ 1 row). */
export function countTerminalRows(rows: string[], columns: number | undefined): number {
  const cols = columns && columns > 0 ? columns : 80;
  return rows.reduce((n, r) => n + Math.max(1, Math.ceil(displayWidth(r) / cols)), 0);
}

/** Truncate to at most `max` cells (ANSI-aware: escape sequences are kept, a reset is appended when cut). */
export function truncateToWidth(s: string, max: number): string {
  if (displayWidth(s) <= max) return s;
  let out = '';
  let w = 0;
  let i = 0;
  while (i < s.length) {
    ANSI_RE.lastIndex = i;
    const m = s[i] === '\x1b' ? ANSI_RE.exec(s) : null;
    if (m && m.index === i) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    const cw = displayWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  ANSI_RE.lastIndex = 0;
  return `${out}…\x1b[0m`;
}

/** Minimal streams the TTY prompter needs (injectable for tests). */
export type TtyInput = NodeJS.ReadableStream & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (mode: boolean) => unknown; read(size?: number): unknown };
export type TtyOutput = { write(s: string): unknown; columns?: number; on?(ev: 'resize', fn: () => void): unknown; off?(ev: 'resize', fn: () => void): unknown };

/**
 * While a long task runs after interactive prompts, keep the TTY in raw mode and swallow keypresses
 * so arrow keys are not echoed as `^[[B^[[A`; Ctrl-C still interrupts. Returns a restore function.
 */
export function swallowInput(input: TtyInput = process.stdin as TtyInput): () => void {
  if (!input.isTTY || !input.setRawMode) return () => {};
  const wasRaw = input.isRaw === true;
  input.setRawMode(true);
  const onData = (d: Buffer | string) => {
    if (String(d).includes('\x03')) {
      restore();
      process.kill(process.pid, 'SIGINT');
    }
  };
  input.on('data', onData);
  input.resume();
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    input.off('data', onData);
    drainInput(input);
    input.setRawMode?.(wasRaw);
    input.pause();
  };
  return restore;
}

/** Discard any buffered keypresses so they do not leak into the shell after we exit. */
function drainInput(input: TtyInput): void {
  try {
    while (input.read() != null) {
      /* discard */
    }
  } catch {
    /* not readable */
  }
}

function progressBar(label: string, total: number, interactive: boolean): Progress {
  let done = 0;
  const width = 24;
  const render = (detail = '') => {
    const pct = total ? done / total : 1;
    const filled = Math.round(pct * width);
    const line = `${color.cyan('◆')} ${label} ${color.green('█'.repeat(filled))}${color.dim('░'.repeat(width - filled))} ${done}/${total} ${color.dim(detail)}`;
    if (interactive) process.stdout.write(`\r\x1b[2K${truncateToWidth(line, (process.stdout.columns || 80) - 1)}`);
  };
  const restoreInput = interactive ? swallowInput() : () => {};
  render();
  return {
    tick(n = 1, detail) {
      done = Math.min(total, done + n);
      render(detail);
    },
    done(message) {
      restoreInput();
      if (interactive) process.stdout.write('\r\x1b[2K');
      console.log(`${color.green('◇')} ${message ?? `${label} ${done}/${total}`}`);
    },
  };
}

/** Line-based prompter: one stdin line per prompt; also used for tests via `answers`. */
export function createLinePrompter(answers?: string[]): Prompter {
  let rl: readline.Interface | null = null;
  const queue: string[] = [];
  const waiters: Array<(l: string | null) => void> = [];
  let ended = false;
  const nextLine = (): Promise<string | null> => {
    if (answers) return Promise.resolve(answers.length ? answers.shift()! : null);
    if (!rl) {
      rl = readline.createInterface({ input: process.stdin, terminal: false });
      rl.on('line', (l) => {
        const w = waiters.shift();
        if (w) w(l);
        else queue.push(l);
      });
      rl.on('close', () => {
        ended = true;
        while (waiters.length) waiters.shift()!(null);
      });
    }
    if (queue.length) return Promise.resolve(queue.shift()!);
    if (ended) return Promise.resolve(null);
    return new Promise((r) => waiters.push(r));
  };
  const ask = async (q: string): Promise<string> => {
    process.stdout.write(`${color.cyan('?')} ${q} `);
    const l = await nextLine();
    process.stdout.write(`${l ?? ''}\n`);
    return (l ?? '').trim();
  };
  const p: Prompter = {
    intro: (t) => console.log(`${color.magenta('┌')} ${color.bold(t)}`),
    outro: (m) => {
      console.log(`${color.magenta('└')} ${m}`);
      rl?.close();
    },
    note: (m, t) => console.log(`${t ? `${color.bold(t)}\n` : ''}${m.split('\n').map((l) => `${bar} ${l}`).join('\n')}`),
    async text(message, opts) {
      for (let i = 0; i < 3; i++) {
        const v = (await ask(`${message}${opts?.default ? color.dim(` (${opts.default})`) : ''}`)) || opts?.default || '';
        const err = opts?.validate?.(v) ?? null;
        if (!err) return v;
        console.log(color.red(`  ${err}`));
      }
      throw new CancelledError();
    },
    async confirm(message, def = true) {
      const v = (await ask(`${message} ${color.dim(def ? '(Y/n)' : '(y/N)')}`)).toLowerCase();
      return v ? v.startsWith('y') : def;
    },
    async select(message, choices, def) {
      choices.forEach((ch, i) => console.log(`  ${i + 1}) ${ch.label}${ch.hint ? color.dim(` — ${ch.hint}`) : ''}`));
      const v = await ask(message);
      if (!v) return def ?? choices[0]!.value;
      const n = Number(v);
      if (Number.isInteger(n) && choices[n - 1]) return choices[n - 1]!.value;
      const hit = choices.find((ch) => String(ch.value) === v || ch.label === v);
      if (hit) return hit.value;
      throw new CancelledError();
    },
    async multiselect(message, choices, opts) {
      const v = await ask(`${message} ${color.dim('(comma-separated values or numbers)')}`);
      if (!v) return opts?.initial ?? [];
      const out: Array<(typeof choices)[number]['value']> = [];
      for (const part of v.split(',').map((s) => s.trim()).filter(Boolean)) {
        const n = Number(part);
        const hit = Number.isInteger(n) && choices[n - 1] ? choices[n - 1] : choices.find((ch) => String(ch.value) === part);
        if (hit && !out.includes(hit.value)) out.push(hit.value);
      }
      return out;
    },
    progress: (label, total) => progressBar(label, total, false),
  };
  return p;
}

/** Raw-mode interactive prompter (arrow keys, space to toggle, type to filter). */
export function createTtyPrompter(io: { input?: TtyInput; output?: TtyOutput } = {}): Prompter {
  const line = createLinePrompter();
  const input = io.input ?? (process.stdin as TtyInput);
  const out: TtyOutput = io.output ?? process.stdout;

  function withKeys<T>(render: () => string[], onKey: (str: string, key: readline.Key) => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      readline.emitKeypressEvents(input);
      const wasRaw = input.isRaw === true;
      input.setRawMode?.(true);
      input.resume();
      // Rows (as drawn) of the previous frame; re-measured at the current width on redraw.
      let prev: string[] = [];
      let prevCols = out.columns;
      const draw = () => {
        const cols = out.columns || 80;
        // Rows are truncated to the width so they never soft-wrap; still measure the previous frame
        // at the width it was drawn with (and at the new width after a resize), whichever is larger.
        const up = prev.length ? Math.max(countTerminalRows(prev, prevCols), countTerminalRows(prev, cols)) : 0;
        if (up) out.write(`\r\x1b[${up}A`);
        out.write('\r\x1b[0J');
        const rows = render().map((r) => truncateToWidth(r, cols - 1));
        out.write(rows.join('\n') + '\n');
        prev = rows;
        prevCols = cols;
      };
      const onResize = () => draw();
      out.on?.('resize', onResize);
      out.write('\x1b[?25l');
      const finish = () => {
        input.off('keypress', handler);
        out.off?.('resize', onResize);
        out.write('\x1b[?25h');
        drainInput(input);
        input.setRawMode?.(wasRaw);
        input.pause();
      };
      const handler = (str: string, key: readline.Key) => {
        if (key?.ctrl && key.name === 'c') {
          finish();
          reject(new CancelledError());
          return;
        }
        const r = onKey(str, key ?? ({} as readline.Key));
        if (r !== undefined) {
          finish();
          resolve(r);
        } else draw();
      };
      input.on('keypress', handler);
      draw();
    });
  }

  return {
    ...line,
    async text(message, opts) {
      let buf = '';
      let err: string | null = null;
      return withKeys(
        () => [
          `${color.cyan('◆')} ${message}`,
          `${bar} ${buf || color.dim(opts?.default ?? '')}${err ? `  ${color.red(err)}` : ''}`,
        ],
        (s, k) => {
          if (k.name === 'return') {
            const v = buf || opts?.default || '';
            err = opts?.validate?.(v) ?? null;
            return err ? undefined : v;
          }
          if (k.name === 'backspace') buf = buf.slice(0, -1);
          else if (s && !k.ctrl && s >= ' ') buf += s;
          return undefined;
        },
      );
    },
    async confirm(message, def = true) {
      let v = def;
      return withKeys(
        () => [`${color.cyan('◆')} ${message}`, `${bar} ${v ? color.green('● Yes') : '○ Yes'} / ${!v ? color.green('● No') : '○ No'}`],
        (s, k) => {
          if (k.name === 'return') return v;
          if (k.name === 'left' || k.name === 'right' || k.name === 'tab') v = !v;
          if (s === 'y') return true;
          if (s === 'n') return false;
          return undefined;
        },
      );
    },
    async select(message, choices, def) {
      let i = Math.max(0, choices.findIndex((ch) => ch.value === def));
      return withKeys(
        () => [
          `${color.cyan('◆')} ${message}`,
          ...choices.map((ch, j) => `${bar} ${j === i ? color.green('●') : color.dim('○')} ${ch.label}${ch.hint && j === i ? color.dim(` — ${ch.hint}`) : ''}`),
        ],
        (_s, k) => {
          if (k.name === 'up') i = (i - 1 + choices.length) % choices.length;
          if (k.name === 'down') i = (i + 1) % choices.length;
          if (k.name === 'return') return choices[i]!.value;
          return undefined;
        },
      );
    },
    async multiselect(message, choices, opts) {
      const selected = new Set(opts?.initial ?? []);
      let filter = '';
      let i = 0;
      let warn = '';
      const visible = () => choices.filter((ch) => !filter || `${ch.label} ${String(ch.value)} ${ch.hint ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
      return withKeys(
        () => {
          const vis = visible();
          i = Math.min(i, Math.max(0, vis.length - 1));
          const start = Math.max(0, Math.min(i - 5, vis.length - 12));
          return [
            `${color.cyan('◆')} ${message} ${color.dim('(type to search, space to toggle, a = all, enter to confirm)')}`,
            `${bar} ${color.dim('search:')} ${filter}${warn ? `  ${color.red(warn)}` : ''}  ${color.dim(`${selected.size} selected`)}`,
            ...vis.slice(start, start + 12).map((ch, j) => {
              const idx = start + j;
              const on = selected.has(ch.value);
              return `${bar} ${idx === i ? color.cyan('›') : ' '} ${on ? color.green('◼') : color.dim('◻')} ${ch.label}${ch.hint ? color.dim(` ${ch.hint}`) : ''}`;
            }),
          ];
        },
        (s, k) => {
          const vis = visible();
          warn = '';
          if (k.name === 'up') i = Math.max(0, i - 1);
          else if (k.name === 'down') i = Math.min(vis.length - 1, i + 1);
          else if (k.name === 'space') {
            const ch = vis[i];
            if (ch) {
              if (selected.has(ch.value)) selected.delete(ch.value);
              else selected.add(ch.value);
            }
          } else if (k.name === 'return') {
            if (opts?.required && selected.size === 0) warn = 'select at least one';
            else return [...selected];
          } else if (k.name === 'backspace') filter = filter.slice(0, -1);
          else if (s === 'a' && !filter) {
            const all = vis.every((ch) => selected.has(ch.value));
            for (const ch of vis) {
              if (all) selected.delete(ch.value);
              else selected.add(ch.value);
            }
          } else if (s && !k.ctrl && s > ' ') {
            filter += s;
            i = 0;
          }
          return undefined;
        },
      );
    },
    progress: (label, total) => progressBar(label, total, true),
  };
}

export function createPrompter(answers?: string[]): Prompter {
  if (answers) return createLinePrompter(answers);
  return process.stdin.isTTY && process.stdout.isTTY ? createTtyPrompter() : createLinePrompter();
}
