import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../config/validate.js';
import {
  startDevWatcher,
  stopDevWatcher,
  __getWatcherState,
} from './watcher.js';

afterEach(() => {
  stopDevWatcher();
});

describe('dev watcher singleton (#23)', () => {
  it('starts one watcher; second call is a no-op', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-watch-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(join(dir, 'messages', 'en.json'), JSON.stringify({ a: 'A' }));

    const config = resolveConfig({
      locales: ['en'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
      outDir: '.tongue',
    });

    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      startDevWatcher(config, dir);
      const first = __getWatcherState();
      expect(first).toBeTruthy();
      expect(existsSync(first!.lockPath)).toBe(true);

      startDevWatcher(config, dir);
      expect(__getWatcherState()).toBe(first);

      stopDevWatcher();
      expect(__getWatcherState()).toBeUndefined();
      await expect(access(first!.lockPath)).rejects.toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('does not start in production', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tongue-watch-prod-'));
    await mkdir(join(dir, 'messages'));
    await writeFile(join(dir, 'messages', 'en.json'), '{}');
    const config = resolveConfig({
      locales: ['en'],
      defaultLocale: 'en',
      messages: './messages/{locale}.json',
    });
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      startDevWatcher(config, dir);
      expect(__getWatcherState()).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
