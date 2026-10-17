import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdTranslate,
  maskIcu,
  validateParity,
} from './translate.js';

describe('maskIcu', () => {
  it('round-trips args and tags', () => {
    const { masked, restore } = maskIcu('Hello {name} <b>x</b>');
    expect(masked).toContain('__TONGUE_0__');
    expect(restore(masked.replace('Hello', 'Hallo'))).toBe(
      'Hallo {name} <b>x</b>',
    );
  });

  it('rejects missing tokens', () => {
    const { restore } = maskIcu('Hi {name}');
    expect(restore('Hi')).toBeNull();
  });
});

describe('validateParity', () => {
  it('accepts matching args', () => {
    expect(() =>
      validateParity('Hello {name}', 'Hallo {name}', 'de'),
    ).not.toThrow();
  });
  it('rejects missing args', () => {
    expect(() => validateParity('Hello {name}', 'Hallo', 'de')).toThrow(/arg mismatch/);
  });
});

describe('cmdTranslate', () => {
  const prevCi = process.env.CI;
  afterEach(() => {
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
    delete process.env.TONGUE_TEST_KEY;
  });

  it('--dry-run makes zero network calls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-tr-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hello, {name}!' } }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: '' } }),
    );
    await writeFile(
      join(dir, 'tongue.config.mjs'),
      `export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  translate: { apiKeyEnv: 'TONGUE_API_KEY' },
};\n`,
    );
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}');
    }) as unknown as typeof fetch;

    await cmdTranslate({
      cwd: dir,
      dryRun: true,
      locale: 'de',
      quiet: true,
      fetchImpl,
    });
    expect(calls).toBe(0);
  });

  it('writes validated translations via mock fetch; key never in lock/logs', async () => {
    delete process.env.CI;
    const dir = await mkdtemp(join(tmpdir(), 'tongue-tr2-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hello, {name}!' } }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: '' } }),
    );
    await writeFile(
      join(dir, 'tongue.config.mjs'),
      `export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  translate: { apiKeyEnv: 'TONGUE_TEST_KEY', model: 'test' },
};\n`,
    );
    const secret = 'secret-never-logged-xyz';
    process.env.TONGUE_TEST_KEY = secret;

    const logs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages: Array<{ content: string }>;
      };
      const user = body.messages.find((m) => m.content.includes('Translate'))?.content ?? '';
      const lines = user.split('\n');
      const masked = lines[lines.length - 1]!;
      const out = masked.replace('Hello', 'Hallo');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: out } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    try {
      await cmdTranslate({
        cwd: dir,
        locale: 'de',
        quiet: true,
        review: false,
        fetchImpl,
      });
    } finally {
      console.error = origErr;
    }

    const de = JSON.parse(await readFile(join(dir, 'messages/de.json'), 'utf8')) as {
      home: { title: string };
    };
    expect(de.home.title).toBe('Hallo, {name}!');
    const lock = await readFile(join(dir, 'tongue.lock'), 'utf8');
    expect(lock).not.toContain(secret);
    expect(logs.join('\n')).not.toContain(secret);
  });

  it('CI defaults to review files', async () => {
    process.env.CI = 'true';
    const dir = await mkdtemp(join(tmpdir(), 'tongue-tr3-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hi' } }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: '' } }),
    );
    await writeFile(
      join(dir, 'tongue.config.mjs'),
      `export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  translate: { apiKeyEnv: 'TONGUE_TEST_KEY' },
};\n`,
    );
    process.env.TONGUE_TEST_KEY = 'k';
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hallo' } }] }),
        { status: 200 },
      )) as unknown as typeof fetch;

    await cmdTranslate({ cwd: dir, locale: 'de', quiet: true, fetchImpl });
    const review = JSON.parse(
      await readFile(join(dir, 'messages/de.review.json'), 'utf8'),
    ) as Record<string, string>;
    expect(review['home.title']).toBe('Hallo');
    const de = JSON.parse(await readFile(join(dir, 'messages/de.json'), 'utf8')) as {
      home: { title: string };
    };
    expect(de.home.title).toBe('');
  });
});
