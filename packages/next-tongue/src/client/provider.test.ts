import { describe, expect, it } from 'vitest';
import { TongueError } from '../errors.js';

// Hook tests need a React renderer; unit-test the error code contract via the
// same TongueError the client throws.
describe('TONGUE_E_NO_PROVIDER', () => {
  it('is a stable error code', () => {
    const err = new TongueError(
      'TONGUE_E_NO_PROVIDER',
      'useT must be used within TongueProvider',
    );
    expect(err.code).toBe('TONGUE_E_NO_PROVIDER');
    expect(err.message).toContain('TongueProvider');
  });
});
