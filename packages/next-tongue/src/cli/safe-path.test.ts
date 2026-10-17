import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { TongueError } from '../errors.js';
import { resolveInsideProject } from './safe-path.js';

describe('resolveInsideProject (CLI security)', () => {
  const cwd = '/tmp/tongue-proj';

  it('allows relative paths under cwd', () => {
    expect(resolveInsideProject(cwd, 'messages/en.json')).toBe(
      join(cwd, 'messages/en.json'),
    );
  });

  it('rejects .. traversal', () => {
    expect(() => resolveInsideProject(cwd, '../etc/passwd')).toThrow(TongueError);
  });

  it('rejects absolute paths outside cwd', () => {
    expect(() => resolveInsideProject(cwd, '/etc/passwd')).toThrow(TongueError);
  });
});
