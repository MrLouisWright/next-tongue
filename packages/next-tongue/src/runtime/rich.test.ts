import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { richJoin, richSelf, richTag } from './rich.js';

describe('rich helpers', () => {
  it('richJoin returns single child as-is', () => {
    expect(richJoin(['hello'])).toBe('hello');
  });

  it('richTag wraps handler output with a stable key', () => {
    const node = richTag((chunks) => createElement('b', null, chunks), 'this', 0);
    expect(renderToStaticMarkup(createElement('span', null, node))).toBe(
      '<span><b>this</b></span>',
    );
  });

  it('richTag passes through when handler is missing', () => {
    const node = richTag(undefined, 'plain', 1);
    expect(renderToStaticMarkup(createElement('span', null, node))).toBe(
      '<span>plain</span>',
    );
  });

  it('richSelf invokes handler', () => {
    const node = richSelf(() => createElement('br'), 0);
    expect(renderToStaticMarkup(createElement('span', null, node))).toBe(
      '<span><br/></span>',
    );
  });
});
