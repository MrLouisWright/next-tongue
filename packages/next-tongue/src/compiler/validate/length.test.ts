import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../../config/validate.js';
import { validateLength } from './length.js';

describe('validateLength', () => {
  it('flags targets over $meta.maxLength', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-len-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({
        save: 'Save',
        save$meta: { description: 'btn', maxLength: 4 },
      }),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({
        save: 'Speichern',
        save$meta: { description: 'btn', maxLength: 4 },
      }),
    );
    const config = resolveConfig({
      locales: ['en', 'de'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      strict: { length: 'warn', unused: 'off', missing: 'off', a11y: 'off' },
    });
    const issues = await validateLength(config, dir);
    expect(issues.some((i) => i.key === 'save' && i.locale === 'de')).toBe(true);
  });
});
