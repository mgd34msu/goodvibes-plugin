/**
 * Session-based auth (Tier 3).
 *
 * Ported verbatim from v1 precision-engine `utils/fetch/auth/session-auth.ts`.
 * Acquires a token by POSTing login credentials and extracting it via a
 * dot-path.
 */

import { type SessionAuth, type SecretValue, resolveSecretValue, setServiceSecret } from '../secrets-store.js';

/** Result of a session acquisition. */
export interface SessionResult {
  success: boolean;
  token?: string;
  expires_at?: number;
  error?: string;
}

/** True when the config has what it needs to log in. */
export function canAcquireSession(auth: SessionAuth): boolean {
  return !!(auth.login_url && auth.login_body);
}

/** Extract a value from a nested object via a dot-notation path. */
export function extractFromPath(obj: unknown, jsonPath: string): unknown {
  const parts = jsonPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveLoginBody(body: Record<string, SecretValue>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    const resolvedValue = resolveSecretValue(value);
    if (resolvedValue !== undefined) {resolved[key] = resolvedValue;}
  }
  return resolved;
}

/** Acquire a session token by posting to the login URL. */
export async function acquireSessionToken(auth: SessionAuth): Promise<SessionResult> {
  if (!auth.login_url || !auth.login_body) {
    return { success: false, error: 'Missing required fields: login_url, login_body' };
  }

  try {
    new URL(auth.login_url);
  } catch {
    return { success: false, error: `Invalid login_url: ${auth.login_url}` };
  }

  try {
    const resolvedBody = resolveLoginBody(auth.login_body);

    const response = await fetch(auth.login_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resolvedBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Session login failed: HTTP ${response.status} - ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const tokenPath = auth.token_path ?? 'access_token';
    const token = extractFromPath(data, tokenPath);

    if (!token || typeof token !== 'string') {
      return { success: false, error: `Token not found at path "${tokenPath}" in login response` };
    }

    let expiresAt: number | undefined;
    const expiresIn = extractFromPath(data, 'expires_in');
    if (typeof expiresIn === 'number') {expiresAt = Date.now() + expiresIn * 1000;}

    return { success: true, token, expires_at: expiresAt };
  } catch (error) {
    return {
      success: false,
      error: `Session login error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Acquire a session token and persist it. */
export async function acquireAndStore(
  serviceName: string,
  currentAuth: SessionAuth,
): Promise<SessionAuth | null> {
  const result = await acquireSessionToken(currentAuth);
  if (!result.success || !result.token) {return null;}

  const updatedAuth: SessionAuth = {
    ...currentAuth,
    access_token: result.token,
    expires_at: result.expires_at,
  };

  await setServiceSecret(serviceName, updatedAuth);
  return updatedAuth;
}
