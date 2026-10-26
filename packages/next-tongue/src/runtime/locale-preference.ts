/**
 * HMAC-signed locale preference cookies (Web Crypto only — ADR 0012).
 * Shared by `setLocalePreference` (server) and `verifyLocalePreference` (proxy).
 */

const enc = new TextEncoder();

let subtlePromise: Promise<SubtleCrypto> | undefined;

/**
 * Web Crypto `subtle`: the global on Node ≥ 20, edge and browsers; on Node 18
 * (no global `crypto`) fall back to `node:crypto`'s `webcrypto`. The import is
 * only reached when the global is missing (never on edge) and is hidden from
 * bundlers so edge/client builds don't try to resolve `node:crypto`.
 */
function getSubtle(): Promise<SubtleCrypto> {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.subtle) return Promise.resolve(g.subtle);
  return (subtlePromise ??= (async () => {
    const id = 'node:crypto';
    const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ id)) as { webcrypto?: Crypto };
    if (!mod.webcrypto?.subtle) throw new Error('next-tongue: Web Crypto is not available in this runtime');
    return mod.webcrypto.subtle;
  })());
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Constant-time string compare (equal length required). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return (await getSubtle()).importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await (await getSubtle()).sign('HMAC', key, enc.encode(data));
  return toBase64Url(sig);
}

export type SignLocalePreferenceOptions = {
  /** Unix expiry (seconds). Defaults to now + maxAge. */
  exp?: number;
  /** Seconds from now; default 1 year. */
  maxAge?: number;
};

/**
 * Build `locale.exp.sig` for Set-Cookie.
 */
export async function signLocalePreference(
  locale: string,
  secret: string,
  opts: SignLocalePreferenceOptions = {},
): Promise<string> {
  const maxAge = opts.maxAge ?? 60 * 60 * 24 * 365;
  const exp = opts.exp ?? Math.floor(Date.now() / 1000) + maxAge;
  const payload = `${locale}.${exp}`;
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * Verify a preference cookie value. Returns the locale or `undefined`
 * (tampered, expired, malformed, or empty).
 */
export async function verifyLocalePreference(
  value: string | undefined | null,
  secret: string,
  opts: { now?: number; locales?: readonly string[] } = {},
): Promise<string | undefined> {
  if (value == null || value === '' || !secret) return undefined;
  const parts = value.split('.');
  if (parts.length !== 3) return undefined;
  const [locale, expStr, sig] = parts as [string, string, string];
  if (!locale || !expStr || !sig) return undefined;
  if (/[\0\r\n\\/]/.test(locale) || locale.includes('..')) return undefined;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return undefined;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (exp < now) return undefined;

  const expected = await hmacSign(secret, `${locale}.${expStr}`);
  if (!timingSafeEqual(sig, expected)) return undefined;

  // Reject if signature bytes themselves look truncated/garbled beyond compare
  if (!fromBase64Url(sig)) return undefined;

  if (opts.locales && !opts.locales.includes(locale)) return undefined;
  return locale;
}

export const DEFAULT_PREF_COOKIE = 'TONGUE_PREF';
