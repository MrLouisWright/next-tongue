import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig } from '../config/validate.js';
import { buildMessages } from './build.js';

const require = createRequire(import.meta.url);

/** Let generated `.tongue/rich.js` resolve `react` from a temp fixture dir. */
async function linkReact(dir: string): Promise<void> {
  const reactRoot = dirname(require.resolve('react/package.json'));
  await mkdir(join(dir, 'node_modules'), { recursive: true });
  await symlink(reactRoot, join(dir, 'node_modules/react'));
}

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

  it('emits t.rich tag handlers with stable keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-rich-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages', 'en.json'),
      JSON.stringify({
        legal: {
          terms: 'I accept the <link>terms</link>.',
          line: 'Line<br/>break',
        },
      }),
    );
    await writeFile(
      join(dir, 'messages', 'de.json'),
      JSON.stringify({
        legal: {
          terms: 'Ich akzeptiere die <link>Bedingungen</link>.',
          line: 'Zeile<br/>bruch',
        },
      }),
    );
    await writeFile(
      join(dir, 'messages', 'pl.json'),
      JSON.stringify({
        legal: {
          terms: 'Akceptuję <link>warunki</link>.',
          line: 'Linia<br/>łamania',
        },
      }),
    );
    await writeFile(
      join(dir, 'messages', 'ar.json'),
      JSON.stringify({
        legal: {
          terms: 'أوافق على <link>الشروط</link>.',
          line: 'سطر<br/>فاصل',
        },
      }),
    );

    const config = resolveConfig({
      locales: ['en', 'de', 'pl', 'ar'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    await buildMessages({ config, cwd: dir, idempotent: false });
    await linkReact(dir);

    const termsSrc = await readFile(join(dir, '.tongue/msg/legal/terms.js'), 'utf8');
    expect(termsSrc).toContain("from '../../rich.js'");
    expect(termsSrc).toContain('.rich = function');
    expect(termsSrc).toContain('_rt(');

    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const mod = await import(
      pathToFileURL(join(dir, '.tongue/msg/legal/terms.js')).href
    );

    expect(mod.terms('en')).toBe('I accept the terms.');
    expect(mod.terms('de')).toBe('Ich akzeptiere die Bedingungen.');

    for (const locale of ['en', 'de', 'pl', 'ar']) {
      const html = renderToStaticMarkup(
        createElement(
          'div',
          null,
          mod.terms.rich(locale, {
            link: (chunks: unknown) => createElement('a', { href: '/t' }, chunks as never),
          }),
        ),
      );
      expect(html).toContain('<a href="/t">');
    }

    const line = await import(
      pathToFileURL(join(dir, '.tongue/msg/legal/line.js')).href
    );
    const brHtml = renderToStaticMarkup(
      createElement(
        'div',
        null,
        line.line.rich('en', { br: () => createElement('br') }),
      ),
    );
    expect(brHtml).toBe('<div>Line<br/>break</div>');
  });
});
