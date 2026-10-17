import { describe, expect, it } from 'vitest';
import { buildEditorUrl, parseSourceRef } from './editor-url.js';

describe('buildEditorUrl', () => {
  it('builds vscode links by default', () => {
    expect(buildEditorUrl('/app/messages/en.json', 12, 'vscode')).toBe(
      'vscode://file/app/messages/en.json:12',
    );
  });

  it('supports cursor and idea presets', () => {
    expect(buildEditorUrl('/x.json', 1, 'cursor')).toBe('cursor://file/x.json:1');
    expect(buildEditorUrl('/x.json', 3, 'webstorm')).toContain('idea://open');
  });

  it('supports templates', () => {
    expect(buildEditorUrl('/a.json', 9, 'custom://{file}#{line}')).toBe(
      'custom:///a.json#9',
    );
  });
});

describe('parseSourceRef', () => {
  it('parses file:line', () => {
    expect(parseSourceRef('messages/en.json:12')).toEqual({
      file: 'messages/en.json',
      line: 12,
    });
  });
});
