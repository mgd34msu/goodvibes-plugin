/**
 * Credential store for connect service authentication.
 *
 * Ported from v1 precision-engine `utils/fetch/secrets-store.ts` — the
 * best-engineered v1 feature (0600 perms, `{$env}` indirection, purge-on-remove)
 * is kept intact. The only v2 change is location: the file moves under the
 * namespaced v2 state directory (`.goodvibes/v2/goodvibes.secrets.json`) via
 * `core/config` `statePath`, so v1 and v2 credentials never collide (R15). The
 * basename is preserved so the triple gitignore guard still recognises it.
 *
 * Value types:
 *  - literal string: "my-api-key"
 *  - environment reference: { "$env": "MY_API_KEY" } (resolved at use time)
 */

import * as fs from 'fs';
import * as path from 'path';
import { statePath } from '@goodvibes/core/config';
import { ensureGitignore } from './secrets-guard.js';

/** Auth configuration for a service. */
export interface ServiceAuth {
  type: 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'session' | 'custom-headers' | 'none';
  /** For bearer auth. */
  token?: string | EnvRef;
  /** For basic auth. */
  username?: string | EnvRef;
  password?: string | EnvRef;
  /** For api-key auth. */
  header?: string;
  key?: string | EnvRef;
  /** For custom-headers auth. */
  headers?: Record<string, string | EnvRef>;
  /** For OAuth2. */
  client_id?: string | EnvRef;
  client_secret?: string | EnvRef;
  token_url?: string;
  authorize_url?: string;
  redirect_uri?: string;
  scopes?: string[];
  /** Runtime-acquired OAuth2 access token (always plain, managed by orchestrator). */
  access_token?: string;
  /** Runtime-acquired OAuth2 refresh token (always plain, managed by orchestrator). */
  refresh_token?: string;
  expires_at?: number;
  /** For session auth. */
  login_url?: string;
  login_body?: Record<string, string | EnvRef>;
  token_path?: string;
}

/** Environment-variable reference. */
export interface EnvRef {
  $env: string;
}

/** Full secrets file structure. */
export interface SecretsFile {
  services: Record<string, ServiceAuth>;
  global: Record<string, string | EnvRef>;
}

/** The credential file path (namespaced under `.goodvibes/v2/`, R15). */
function getSecretsPath(): string {
  return statePath('goodvibes.secrets.json');
}

/**
 * Load credentials from disk. Returns empty defaults when the file is absent.
 */
export async function loadSecrets(): Promise<SecretsFile> {
  const secretsPath = getSecretsPath();
  try {
    const content = await fs.promises.readFile(secretsPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<SecretsFile>;
    return {
      services: parsed.services ?? {},
      global: parsed.global ?? {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { services: {}, global: {} };
    }
    throw error;
  }
}

/**
 * Persist credentials with owner-only (0600) permissions after ensuring the
 * gitignore guard is in place.
 */
export async function saveSecrets(secrets: SecretsFile): Promise<void> {
  const secretsPath = getSecretsPath();
  const secretsDir = path.dirname(secretsPath);

  await ensureGitignore(process.cwd());
  await fs.promises.mkdir(secretsDir, { recursive: true });

  await fs.promises.writeFile(secretsPath, JSON.stringify(secrets, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/** Get auth for a service, or undefined when absent. */
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
  if (!(name in secrets.services)) {
    return false;
  }
  delete secrets.services[name];
  await saveSecrets(secrets);
  return true;
}

/** Type guard: is a value an environment reference? */
export function isEnvRef(value: unknown): value is EnvRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$env' in value &&
    typeof (value as EnvRef).$env === 'string'
  );
}

/**
 * Resolve a secret value: strings pass through; `{$env}` refs read from
 * `process.env`; unresolvable refs become undefined.
 */
export function resolveSecretValue(value: string | EnvRef | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (isEnvRef(value)) return process.env[value.$env];
  return undefined;
}

/**
 * Deep-resolve every `$env` reference in an auth config, returning a new object.
 * Unresolvable refs become undefined (consumers must validate before use).
 */
export function resolveAuthConfig(auth: ServiceAuth): ServiceAuth {
  const resolved: ServiceAuth = { type: auth.type };

  if (auth.token !== undefined) resolved.token = resolveSecretValue(auth.token) as string;
  if (auth.username !== undefined) resolved.username = resolveSecretValue(auth.username) as string;
  if (auth.password !== undefined) resolved.password = resolveSecretValue(auth.password) as string;
  if (auth.key !== undefined) resolved.key = resolveSecretValue(auth.key) as string;
  if (auth.client_id !== undefined) resolved.client_id = resolveSecretValue(auth.client_id) as string;
  if (auth.client_secret !== undefined)
    resolved.client_secret = resolveSecretValue(auth.client_secret) as string;
  if (auth.access_token !== undefined) resolved.access_token = auth.access_token;
  if (auth.refresh_token !== undefined) resolved.refresh_token = auth.refresh_token;

  if (auth.header !== undefined) resolved.header = auth.header;
  if (auth.token_url !== undefined) resolved.token_url = auth.token_url;
  if (auth.authorize_url !== undefined) resolved.authorize_url = auth.authorize_url;
  if (auth.redirect_uri !== undefined) resolved.redirect_uri = auth.redirect_uri;
  if (auth.scopes !== undefined) resolved.scopes = [...auth.scopes];
  if (auth.expires_at !== undefined) resolved.expires_at = auth.expires_at;
  if (auth.login_url !== undefined) resolved.login_url = auth.login_url;
  if (auth.token_path !== undefined) resolved.token_path = auth.token_path;

  if (auth.headers) {
    resolved.headers = {};
    for (const [key, value] of Object.entries(auth.headers)) {
      const resolvedVal = resolveSecretValue(value);
      if (resolvedVal !== undefined) resolved.headers[key] = resolvedVal;
    }
  }

  if (auth.login_body) {
    resolved.login_body = {};
    for (const [key, value] of Object.entries(auth.login_body)) {
      const resolvedVal = resolveSecretValue(value);
      if (resolvedVal !== undefined) resolved.login_body[key] = resolvedVal;
    }
  }

  return resolved;
}

/** List service names that have stored credentials. */
export async function listServiceNames(): Promise<string[]> {
  const secrets = await loadSecrets();
  return Object.keys(secrets.services);
}
