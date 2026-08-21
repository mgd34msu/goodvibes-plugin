/**
 * Credential store for connect service authentication.
 *
 * Ported from v1 precision-engine `utils/fetch/secrets-store.ts`, the
 * best-engineered v1 feature (0600 perms, `{$env}` indirection, purge-on-remove)
 * is kept intact. The only v2 change is location: the file moves under the
 * namespaced v2 state directory (`.goodvibes/goodvibes.secrets.json`) via
 * `core/config` `statePath`, so v1 and v2 credentials never collide (R15). The
 * basename is preserved so the triple gitignore guard still recognises it.
 *
 * The auth shape itself lives in `service-auth.ts` and is re-exported here, so
 * every consumer keeps importing it from the store. Reading the file is a trust
 * boundary: each stored record goes through `normalizeStoredAuth` on the way in,
 * and code past this module gets a `ServiceAuth` union value it can trust.
 *
 * Value types:
 *  - literal string: "my-api-key"
 *  - environment reference: { "$env": "MY_API_KEY" } (resolved at use time)
 */

import * as fs from 'fs';
import * as path from 'path';
import { statePath } from '@goodvibes/core/config';
import { atomicWriteFile } from '@goodvibes/core/fsx';
import { ensureGitignore } from './secrets-guard.js';
import { normalizeStoredAuth, type ServiceAuth, type SecretValue } from './service-auth.js';

export {
  isEnvRef,
  resolveSecretValue,
  resolveAuthConfig,
  parseServiceAuth,
  normalizeStoredAuth,
} from './service-auth.js';
export type {
  EnvRef,
  SecretValue,
  AuthMode,
  ServiceAuth,
  ResolvedServiceAuth,
  OAuth2Auth,
  SessionAuth,
  ParsedServiceAuth,
} from './service-auth.js';

/** Full secrets file structure. */
export interface SecretsFile {
  services: Record<string, ServiceAuth>;
  global: Record<string, SecretValue>;
  /**
   * Stored records that matched no auth mode, kept verbatim. They are carried
   * back out on the next write so an unrelated `set_auth` never quietly deletes
   * a credential a person may still want to repair by hand.
   */
  unreadable?: Record<string, unknown>;
}

/** The credential file path (namespaced under `.goodvibes/`, R15). */
function getSecretsPath(): string {
  return statePath('goodvibes.secrets.json');
}

/**
 * Load credentials from disk, normalizing each stored record into the auth
 * union. Returns empty defaults when the file is absent.
 */
export async function loadSecrets(): Promise<SecretsFile> {
  const secretsPath = getSecretsPath();
  let parsed: { services?: Record<string, unknown>; global?: Record<string, SecretValue> };

  try {
    const content = await fs.promises.readFile(secretsPath, 'utf-8');
    parsed = JSON.parse(content) as typeof parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { services: {}, global: {} };
    }
    throw error;
  }

  const services: Record<string, ServiceAuth> = {};
  const unreadable: Record<string, unknown> = {};

  for (const [name, record] of Object.entries(parsed.services ?? {})) {
    const auth = normalizeStoredAuth(record);
    if (auth) {
      services[name] = auth;
    } else {
      unreadable[name] = record;
    }
  }

  const loaded: SecretsFile = { services, global: parsed.global ?? {} };
  if (Object.keys(unreadable).length > 0) {
    loaded.unreadable = unreadable;
  }
  return loaded;
}

/**
 * Persist credentials with owner-only (0600) permissions after ensuring the
 * gitignore guard is in place. The write is temp-then-rename: a process killed
 * mid-refresh would otherwise leave a truncated file, and `loadSecrets` treats
 * a parse failure as fatal for EVERY service, not just the one being written.
 */
export async function saveSecrets(secrets: SecretsFile): Promise<void> {
  const secretsPath = getSecretsPath();
  const secretsDir = path.dirname(secretsPath);

  await ensureGitignore(process.cwd());
  await fs.promises.mkdir(secretsDir, { recursive: true });

  const onDisk = {
    services: { ...(secrets.unreadable ?? {}), ...secrets.services },
    global: secrets.global,
  };

  await atomicWriteFile(secretsPath, JSON.stringify(onDisk, null, 2) + '\n', { mode: 0o600 });
}

/** Get auth for a service, or undefined when absent or unreadable. */
export async function getServiceSecrets(name: string): Promise<ServiceAuth | undefined> {
  const secrets = await loadSecrets();
  return secrets.services[name];
}

/** Create or update auth for a service. */
export async function setServiceSecret(name: string, auth: ServiceAuth): Promise<void> {
  const secrets = await loadSecrets();
  secrets.services[name] = auth;
  await saveSecrets(secrets);
}

/** Remove auth for a service. Returns true when an entry was removed. */
export async function removeServiceSecret(name: string): Promise<boolean> {
  const secrets = await loadSecrets();
  const stored = name in secrets.services;
  const broken = secrets.unreadable !== undefined && name in secrets.unreadable;
  if (!stored && !broken) {
    return false;
  }
  delete secrets.services[name];
  if (secrets.unreadable) {
    delete secrets.unreadable[name];
  }
  await saveSecrets(secrets);
  return true;
}

/** List service names that have usable stored credentials. */
export async function listServiceNames(): Promise<string[]> {
  const secrets = await loadSecrets();
  return Object.keys(secrets.services);
}
