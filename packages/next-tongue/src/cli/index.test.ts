import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './index.js';

describe('runCli help exit codes', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it.each([['--help'], ['-h']])('%s with no command exits 0', async (flag) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
    await runCli([flag]);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('no command and no help flag exits 2', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
    await runCli([]);
    expect(process.exitCode).toBe(2);
  });
});
