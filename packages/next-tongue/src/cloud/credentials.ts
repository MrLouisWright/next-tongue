/**
 * Token storage: OS keychain when available (macOS `security`, Linux
 * `secret-tool`), else ~/.config/loomlocale/credentials.json (0600).
 * No native deps — every keychain call is optional and fallback-safe.
 * `LOOMLOCALE_TOKEN` always wins (CI).
 */
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const SERVICE = 'loomlocale-cli';

export type CredentialStore = {
  get(account: string): Promise<string | null>;
  set(account: string, token: string): Promise<'keychain' | 'file'>;
  delete(account: string): Promise<void>;
};

export function credentialsFile(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'loomlocale', 'credentials.json');
}

function keychainDisabled(env: NodeJS.ProcessEnv): boolean {
  return env.LOOMLOCALE_NO_KEYCHAIN === '1' || env.CI === 'true';
}

function run(cmd: string, args: string[], input?: string): { ok: boolean; out: string } {
  try {
    const r = spawnSync(cmd, args, { input, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] });
    return { ok: r.status === 0 && !r.error, out: (r.stdout ?? '').trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

const keychain = {
  get(account: string): string | null {
    if (process.platform === 'darwin') {
      const r = run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w']);
      return r.ok && r.out ? r.out : null;
    }
    if (process.platform === 'linux') {
      const r = run('secret-tool', ['lookup', 'service', SERVICE, 'account', account]);
      return r.ok && r.out ? r.out : null;
    }
    return null;
  },
  set(account: string, token: string): boolean {
    if (process.platform === 'darwin') {
      return run('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w', token]).ok;
    }
    if (process.platform === 'linux') {
      return run('secret-tool', ['store', '--label=Loomlocale CLI', 'service', SERVICE, 'account', account], token).ok;
    }
    return false;
  },
  delete(account: string): void {
    if (process.platform === 'darwin') run('security', ['delete-generic-password', '-s', SERVICE, '-a', account]);
    else if (process.platform === 'linux') run('secret-tool', ['clear', 'service', SERVICE, 'account', account]);
  },
};

async function readFileStore(path: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function createCredentialStore(env: NodeJS.ProcessEnv = process.env): CredentialStore {
  const file = credentialsFile(env);
  const useKeychain = !keychainDisabled(env);
  return {
    async get(account) {
      if (useKeychain) {
        const t = keychain.get(account);
        if (t) return t;
      }
      return (await readFileStore(file))[account] ?? null;
    },
    async set(account, token) {
      if (useKeychain && keychain.set(account, token)) {
        // Drop any stale plaintext copy.
        const data = await readFileStore(file);
        if (account in data) {
          delete data[account];
          await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
        }
        return 'keychain';
      }
      const data = await readFileStore(file);
      data[account] = token;
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await chmod(file, 0o600).catch(() => {});
      return 'file';
    },
    async delete(account) {
      if (useKeychain) keychain.delete(account);
      const data = await readFileStore(file);
      if (account in data) {
        delete data[account];
        if (Object.keys(data).length) await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
        else await rm(file, { force: true });
      }
    },
  };
}

/** Resolve the token: env first, then keychain/file keyed by API base URL. */
export async function resolveToken(
  baseURL: string,
  env: NodeJS.ProcessEnv = process.env,
  store: CredentialStore = createCredentialStore(env),
): Promise<string | null> {
  if (env.LOOMLOCALE_TOKEN) return env.LOOMLOCALE_TOKEN;
  return store.get(baseURL);
}
