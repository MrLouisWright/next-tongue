import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../../config/validate.js';
import { validateCatalog, validateStale } from './catalog.js';

async function fixture(msgs: {
  en: unknown;
  de: unknown;
  lock?: unknown;
}) {
  const dir = await mkdtemp(join(tmpdir(), 'tongue-check-'));
  await mkdir(join(dir, 'messages'));
  await writeFile(join(dir, 'messages/en.json'), JSON.stringify(msgs.en, null, 2));
  await writeFile(join(dir, 'messages/de.json'), JSON.stringify(msgs.de, null, 2));
  if (msgs.lock) {
    await writeFile(join(dir, 'tongue.lock'), JSON.stringify(msgs.lock, null, 2));
  }
  return dir;
}

describe('validateCatalog', () => {
  it('reports missing keys in a locale', async () => {
    const dir = await fixture({
      en: { home: { title: 'Hello', inbox: 'Inbox' } },
      de: { home: { title: 'Hallo' } },
    });
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      strict: { missing: 'error', unused: 'off' },
    });
    const issues = await validateCatalog(config, dir);
    expect(issues.some((i) => i.check === 'missing' && i.key === 'home.inbox')).toBe(
      true,
    );
  });

  it('reports ICU arg mismatch with both locale strings', async () => {
    const dir = await fixture({
      en: { home: { title: 'Hello, {name}!' } },
      de: { home: { title: 'Hallo!' } },
    });
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      strict: { missing: 'off', mismatch: 'error', unused: 'off' },
    });
    const issues = await validateCatalog(config, dir);
    const mismatch = issues.find((i) => i.check === 'mismatch');
    expect(mismatch).toBeTruthy();
    expect(mismatch!.message).toContain('en args=[name]');
    expect(mismatch!.message).toContain('de args=[]');
    expect(mismatch!.message).toContain('Hello, {name}!');
    expect(mismatch!.message).toContain('Hallo!');
  });
});

describe('validateStale', () => {
  it('flags when source hash in lockfile differs', async () => {
    const dir = await fixture({
      en: { home: { title: 'Hello' } },
      de: { home: { title: 'Hallo' } },
      lock: {
        version: 1,
        de: {
          'home.title': {
            source: 'sha256:deadbeef',
            target: 'sha256:cafe',
          },
        },
      },
    });
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      translate: { lockfile: './tongue.lock' },
      strict: { stale: 'warn', unused: 'off' },
    });
    const issues = await validateStale(config, dir);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.check).toBe('stale');
  });
});
