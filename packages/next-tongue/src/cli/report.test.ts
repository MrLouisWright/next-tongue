import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdReport, parseMaxBytes } from './report.js';

describe('parseMaxBytes', () => {
  it('parses units', () => {
    expect(parseMaxBytes('100')).toBe(100);
    expect(parseMaxBytes('4kb')).toBe(4096);
    expect(parseMaxBytes('1mb')).toBe(1048576);
  });
});

describe('cmdReport', () => {
  it('finds tongue msg markers in .next chunks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-report-'));
    await mkdir(join(dir, '.next/static/chunks'), { recursive: true });
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hi' } }),
    );
    await writeFile(
      join(dir, 'tongue.config.mjs'),
      `export default { locales: ['en'], defaultLocale: 'en', messages: './messages/{locale}.json' };\n`,
    );
    await writeFile(
      join(dir, '.next/static/chunks/app-page.js'),
      `import { title as t } from "#tongue/msg/home/title.js";\n`,
    );

    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg?: unknown) => {
      logs.push(String(msg));
    };
    try {
      await cmdReport({ cwd: dir, json: true });
    } finally {
      console.log = orig;
    }
    const payload = JSON.parse(logs.join('\n')) as {
      routes: { keyCount: number; keys: string[] }[];
    };
    expect(payload.routes.some((r) => r.keys.includes('home.title'))).toBe(true);
  });
});
