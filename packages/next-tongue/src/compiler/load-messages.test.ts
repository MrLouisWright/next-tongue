import { describe, expect, it } from 'vitest';
import {
  assertNoLeafBranchCollisions,
  flattenMessages,
} from './load-messages.js';
import { TongueError } from '../errors.js';

describe('flattenMessages leaf/branch collisions', () => {
  it('allows nested objects without a leaf at the same path', () => {
    const flat = flattenMessages({
      contact: {
        email: { label: 'Email', autoSubject: 'Hi {name}' },
      },
    });
    expect(flat['contact.email.label']).toBe('Email');
    expect(flat['contact.email.autoSubject']).toBe('Hi {name}');
  });

  it('allows a leaf beside a differently named group', () => {
    const flat = flattenMessages({
      contact: { email: 'Email', mail: { autoSubject: 'Hi' } },
    });
    expect(flat['contact.email']).toBe('Email');
    expect(flat['contact.mail.autoSubject']).toBe('Hi');
  });

  it('rejects flat catalogs that mix a leaf and a branch', () => {
    expect(() =>
      assertNoLeafBranchCollisions({
        'contact.email': 'Email',
        'contact.email.autoSubject': 'Hi',
      }),
    ).toThrow(TongueError);
    expect(() =>
      assertNoLeafBranchCollisions({
        'contact.email': 'Email',
        'contact.email.autoSubject': 'Hi',
      }),
    ).toThrow(/leaf and a branch/);
  });
});
