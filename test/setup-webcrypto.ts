// Node 18 has no global WebCrypto (Node 20+, Next.js and edge runtimes do).
// Polyfill it for the test run only so the CI matrix can include Node 18.
import { webcrypto } from 'node:crypto';

if (!(globalThis as { crypto?: unknown }).crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
