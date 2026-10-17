import { describe, expect, it } from 'vitest';
import { locateMessageKeys } from './json-locations.js';

describe('locateMessageKeys', () => {
  it('maps nested keys to line numbers', () => {
    const raw = `{
  "home": {
    "title": "Hello",
    "inbox": "You have {count} messages"
  },
  "save": "Save"
}
`;
    const locs = locateMessageKeys(raw, ['home.title', 'home.inbox', 'save']);
    expect(locs['home.title']).toBe(3);
    expect(locs['home.inbox']).toBe(4);
    expect(locs.save).toBe(6);
  });

  it('skips $meta / $description keys', () => {
    const raw = `{
  "save": "Save",
  "save$description": "Button"
}
`;
    const locs = locateMessageKeys(raw, ['save', 'save$description']);
    expect(locs.save).toBe(2);
    expect(locs['save$description']).toBeUndefined();
  });
});
