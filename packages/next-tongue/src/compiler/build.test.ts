import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig } from '../config/validate.js';
import { buildMessages } from './build.js';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-'));
  await mkdir(join(dir, 'messages'));
  await writeFile(
    join(dir, 'messages', 'en.json'),
    JSON.stringify({
      home: {
        title: 'Welcome, {name}!',
        inbox:
          '{count, plural, =0 {No messages} one {# message} other {# messages}}',
      },
    }),
  );
  await writeFile(
    join(dir, 'messages', 'de.json'),
    JSON.stringify({
      home: {
        title: 'Willkommen, {name}!',
        inbox:
          '{count, plural, =0 {Keine Nachrichten} one {# Nachricht} other {# Nachrichten}}',
      },
    }),
  );
  await writeFile(
    join(dir, 'tongue.config.mjs'),
    `export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  timeZone: 'UTC',
};\n`,
  );
  return dir;
}

describe('buildMessages', () => {
  it('emits per-key modules, types, and manifest', async () => {
    const dir = await fixture();
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    const result = await buildMessages({ config, cwd: dir });
    expect(result.keyCount).toBe(2);

    const titleMod = await readFile(
      join(dir, '.tongue/msg/home/title.js'),
      'utf8',
    );
    expect(titleMod).toContain('export function title');
    expect(titleMod).toContain('Welcome');
    expect(titleMod).toContain('Willkommen');

    // Tree-shake smoke: unused export names are separate files
    const inboxMod = await readFile(
      join(dir, '.tongue/msg/home/inbox.js'),
      'utf8',
    );
    expect(inboxMod).toContain('PluralRules');

    const types = await readFile(join(dir, '.tongue/types.d.ts'), 'utf8');
    expect(types).toContain('"home"');
    expect(types).toContain('"title"');
    expect(types).toContain('"count": number');

    // Execute generated module
    const mod = await import(
      pathToFileURL(join(dir, '.tongue/msg/home/title.js')).href
    );
    expect(mod.title('en', { name: 'Ada' })).toBe('Welcome, Ada!');
    expect(mod.title('de', { name: 'Ada' })).toBe('Willkommen, Ada!');

    const inbox = await import(
      pathToFileURL(join(dir, '.tongue/msg/home/inbox.js')).href
    );
    expect(inbox.inbox('en', { count: 0 })).toBe('No messages');
    expect(inbox.inbox('en', { count: 1 })).toBe('1 message');
    expect(inbox.inbox('en', { count: 5 })).toBe('5 messages');
  });
});
