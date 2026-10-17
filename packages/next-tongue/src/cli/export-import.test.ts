import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdExport,
  cmdImport,
  csvToUnits,
  unitsToCsv,
  unitsToXliff,
  xliffToUnits,
} from './export-import.js';

describe('csv/xliff round-trip', () => {
  it('csv is lossless for plain units', () => {
    const units = [
      {
        fullKey: 'home.title',
        source: 'Hello, {name}!',
        target: 'Hallo, {name}!',
        state: 'translated' as const,
        description: 'Greeting',
      },
    ];
    const again = csvToUnits(unitsToCsv(units));
    expect(again[0]?.fullKey).toBe('home.title');
    expect(again[0]?.source).toBe('Hello, {name}!');
    expect(again[0]?.target).toBe('Hallo, {name}!');
    expect(again[0]?.description).toBe('Greeting');
  });

  it('xliff is lossless for plain units', () => {
    const units = [
      {
        fullKey: 'home.title',
        source: 'Hello <b>x</b>',
        target: 'Hallo <b>x</b>',
        state: 'final' as const,
      },
    ];
    const xml = unitsToXliff(units, 'en', 'de');
    expect(xml).toContain('version="2.0"');
    expect(xml).toContain('urn:oasis:names:tc:xliff:document:2.0');
    const again = xliffToUnits(xml);
    expect(again[0]?.source).toBe('Hello <b>x</b>');
    expect(again[0]?.target).toBe('Hallo <b>x</b>');
    expect(again[0]?.state).toBe('final');
  });
});

describe('cmdExport/cmdImport', () => {
  it('export → import round-trip updates messages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-xi-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(
      join(dir, 'messages/en.json'),
      JSON.stringify({ home: { title: 'Hello, {name}!' } }, null, 2),
    );
    await writeFile(
      join(dir, 'messages/de.json'),
      JSON.stringify({ home: { title: 'TEMP' } }, null, 2),
    );
    await writeFile(
      join(dir, 'tongue.config.mjs'),
      `export default { locales: ['en', 'de'], defaultLocale: 'en', messages: './messages/{locale}.json' };\n`,
    );

    await cmdExport({
      cwd: dir,
      format: 'xliff',
      locale: 'de',
      out: './translations',
      quiet: true,
    });

    let xlf = await readFile(join(dir, 'translations/de.xlf'), 'utf8');
    xlf = xlf.replace(
      '<target>TEMP</target>',
      '<target>Hallo, {name}!</target>',
    );
    await writeFile(join(dir, 'translations/de.xlf'), xlf, 'utf8');

    await cmdImport({
      cwd: dir,
      file: './translations/de.xlf',
      quiet: true,
    });

    const de = JSON.parse(await readFile(join(dir, 'messages/de.json'), 'utf8')) as {
      home: { title: string };
    };
    expect(de.home.title).toBe('Hallo, {name}!');
  });
});
