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

function progressBar(label: string, total: number, interactive: boolean): Progress {
  let done = 0;
  const width = 24;
  const render = (detail = '') => {
    const pct = total ? done / total : 1;
    const filled = Math.round(pct * width);
    const line = `${color.cyan('◆')} ${label} ${color.green('█'.repeat(filled))}${color.dim('░'.repeat(width - filled))} ${done}/${total} ${color.dim(detail)}`;
    if (interactive) process.stdout.write(`\r\x1b[2K${line}`);
  };
  render();
  return {
    tick(n = 1, detail) {
      done = Math.min(total, done + n);
      render(detail);
    },
    done(message) {
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
export function createTtyPrompter(): Prompter {
  const line = createLinePrompter();
  const out = process.stdout;

  function withKeys<T>(render: () => string[], onKey: (str: string, key: readline.Key) => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      let lines = 0;
      const draw = () => {
        if (lines) out.write(`\x1b[${lines}A`);
        out.write('\x1b[0J');
        const rows = render();
        out.write(rows.join('\n') + '\n');
        lines = rows.length;
      };
      const finish = () => {
        process.stdin.off('keypress', handler);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
      };
      const handler = (str: string, key: readline.Key) => {
        if (key?.ctrl && key.name === 'c') {
          finish();
          reject(new CancelledError());
          return;
        }
        const r = onKey(str, key);
        if (r !== undefined) {
          finish();
          resolve(r);
        } else draw();
      };
      process.stdin.on('keypress', handler);
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
