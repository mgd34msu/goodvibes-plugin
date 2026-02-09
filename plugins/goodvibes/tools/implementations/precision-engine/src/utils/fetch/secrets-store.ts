/**
 * Secrets store for precision_fetch service authentication.
 * Manages API keys, tokens, and credentials in a secure local file.
 * 
 * File location: .goodvibes/goodvibes.secrets.json
 * Permissions: 0o600 (owner read/write only)
 * 
 * Supports two value types:
 * - Literal string: "my-api-key"
 * - Environment variable reference: { "$env": "MY_API_KEY" }
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureGitignore } from './secrets-guard.js';

/** Auth configuration for a service */
export interface ServiceAuth {
  type: 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'session' | 'custom-headers' | 'none';
  /** For bearer auth */
  token?: string | EnvRef;
  /** For basic auth */
  username?: string | EnvRef;
  password?: string | EnvRef;
  /** For api-key auth */
  header?: string;
  key?: string | EnvRef;
  /** For custom-headers auth */
  headers?: Record<string, string | EnvRef>;
  /** For OAuth2 */
  client_id?: string | EnvRef;
  client_secret?: string | EnvRef;
  token_url?: string;
  authorize_url?: string;
  redirect_uri?: string;
  scopes?: string[];
  /** Runtime-acquired OAuth2 access token (always plain string, never EnvRef — managed by auth orchestrator) */
  access_token?: string;
  /** Runtime-acquired OAuth2 refresh token (always plain string, never EnvRef — managed by auth orchestrator) */
  refresh_token?: string;
  expires_at?: number;
  /** For session auth */
  login_url?: string;
  login_body?: Record<string, string | EnvRef>;
  token_path?: string;
}

/** Environment variable reference */
export interface EnvRef {
  $env: string;
}

/** Full secrets file structure */
export interface SecretsFile {
  services: Record<string, ServiceAuth>;
  global: Record<string, string | EnvRef>;
}

/**
 * Get the secrets file path.
 */
function getSecretsPath(): string {
  return path.join(process.cwd(), '.goodvibes', 'goodvibes.secrets.json');
}

/**
 * Load secrets from disk.
 * Returns empty defaults if file doesn't exist.
 */
export async function loadSecrets(): Promise<SecretsFile> {
  const secretsPath = getSecretsPath();
  
  try {
    const content = await fs.promises.readFile(secretsPath, 'utf-8');
    const parsed = JSON.parse(content);
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
 * Save secrets to disk with secure permissions.
 * Ensures gitignore entries exist before writing.
 */
export async function saveSecrets(secrets: SecretsFile): Promise<void> {
  const secretsPath = getSecretsPath();
  const secretsDir = path.dirname(secretsPath);
  
  // Ensure gitignore has entries for secrets files
  await ensureGitignore(process.cwd());
  
  // Ensure directory exists
  await fs.promises.mkdir(secretsDir, { recursive: true });
  
  // Write with restricted permissions
  await fs.promises.writeFile(
    secretsPath,
    JSON.stringify(secrets, null, 2) + '\n',
    { encoding: 'utf-8', mode: 0o600 }
  );
}

/**
 * Get auth configuration for a specific service.
 * Returns undefined if service not found.
 */
export async function getServiceSecrets(name: string): Promise<ServiceAuth | undefined> {
  const secrets = await loadSecrets();
  return secrets.services[name];
}

/**
 * Set auth configuration for a specific service.
 * Creates or updates the service entry.
 * 
 * NOTE: No file-level locking. Safe in single-threaded MCP execution model.
 * If concurrent writes are needed, add a mutex/file-lock.
 */
export async function setServiceSecret(name: string, auth: ServiceAuth): Promise<void> {
  const secrets = await loadSecrets();
  secrets.services[name] = auth;
  await saveSecrets(secrets);
}

/**
 * Remove auth configuration for a specific service.
 * 
 * NOTE: No file-level locking. Safe in single-threaded MCP execution model.
 */
export async function removeServiceSecret(name: string): Promise<boolean> {
  const secrets = await loadSecrets();
  if (!(name in secrets.services)) {
    return false;
  }
  delete secrets.services[name];
  await saveSecrets(secrets);
  return true;
}

/**
 * Check if a value is an environment variable reference.
 */
export function isEnvRef(value: unknown): value is EnvRef {
  return typeof value === 'object' && value !== null && '$env' in value && typeof (value as EnvRef).$env === 'string';
}

/**
 * Resolve a secret value.
 * - If string, return as-is.
 * - If { "$env": "VAR" }, resolve from process.env.
 * - Returns undefined if env var not found.
 */
export function resolveSecretValue(value: string | EnvRef | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (isEnvRef(value)) {
    return process.env[value.$env];
  }
  return undefined;
}

/**
 * Deep-resolve all $env references in an auth config object.
 * Returns a new object with all env refs replaced by their values.
 * Unresolvable refs become undefined.
 *
 * Note: Resolved string fields may be undefined at runtime if referenced
 * environment variables are missing, despite the ServiceAuth type signature.
 * Consumers should validate resolved values before use.
 */
export function resolveAuthConfig(auth: ServiceAuth): ServiceAuth {
  const resolved: ServiceAuth = { type: auth.type };
  
  // Resolve simple string|EnvRef fields
  if (auth.token !== undefined) resolved.token = resolveSecretValue(auth.token) as string;
  if (auth.username !== undefined) resolved.username = resolveSecretValue(auth.username) as string;
  if (auth.password !== undefined) resolved.password = resolveSecretValue(auth.password) as string;
  if (auth.key !== undefined) resolved.key = resolveSecretValue(auth.key) as string;
  if (auth.client_id !== undefined) resolved.client_id = resolveSecretValue(auth.client_id) as string;
  if (auth.client_secret !== undefined) resolved.client_secret = resolveSecretValue(auth.client_secret) as string;
  if (auth.access_token !== undefined) resolved.access_token = auth.access_token;
  if (auth.refresh_token !== undefined) resolved.refresh_token = auth.refresh_token;
  
  // Copy non-secret fields as-is
  if (auth.header !== undefined) resolved.header = auth.header;
  if (auth.token_url !== undefined) resolved.token_url = auth.token_url;
  if (auth.authorize_url !== undefined) resolved.authorize_url = auth.authorize_url;
  if (auth.redirect_uri !== undefined) resolved.redirect_uri = auth.redirect_uri;
  if (auth.scopes !== undefined) resolved.scopes = [...auth.scopes];
  if (auth.expires_at !== undefined) resolved.expires_at = auth.expires_at;
  if (auth.login_url !== undefined) resolved.login_url = auth.login_url;
  if (auth.token_path !== undefined) resolved.token_path = auth.token_path;
  
  // Resolve headers map
  if (auth.headers) {
    resolved.headers = {};
    for (const [key, value] of Object.entries(auth.headers)) {
      const resolvedVal = resolveSecretValue(value);
      if (resolvedVal !== undefined) {
        resolved.headers[key] = resolvedVal;
      }
    }
  }
  
  // Resolve login_body map
  if (auth.login_body) {
    resolved.login_body = {};
    for (const [key, value] of Object.entries(auth.login_body)) {
      const resolvedVal = resolveSecretValue(value);
      if (resolvedVal !== undefined) {
        resolved.login_body[key] = resolvedVal;
      }
    }
  }
  
  return resolved;
}

/**
 * List all service names that have stored secrets.
 */
export async function listServiceNames(): Promise<string[]> {
  const secrets = await loadSecrets();
  return Object.keys(secrets.services);
}
