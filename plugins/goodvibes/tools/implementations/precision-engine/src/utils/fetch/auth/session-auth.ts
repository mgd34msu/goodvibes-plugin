/**
 * Session-based authentication — Tier 3.
 * Acquires session tokens by posting login credentials to a login URL.
 */

import { type ServiceAuth, type EnvRef, resolveSecretValue, setServiceSecret } from '../secrets-store.js';

/** Session acquisition result */
export interface SessionResult {
  success: boolean;
  token?: string;
  expires_at?: number;
  error?: string;
}

/**
 * Check if a session auth config has the requirements for login.
 */
export function canAcquireSession(auth: ServiceAuth): boolean {
  return !!(auth.login_url && auth.login_body);
}

/**
 * Extract a value from a nested object using dot-notation path.
 * e.g., extractFromPath({ data: { token: "abc" } }, "data.token") => "abc"
 */
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

/**
 * Deep-resolve all EnvRef values in a login body object.
 * Returns a new object with all { $env: "VAR" } replaced by their values.
 */
function resolveLoginBody(body: Record<string, string | EnvRef>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    const resolvedValue = resolveSecretValue(value);
    if (resolvedValue !== undefined) {
      resolved[key] = resolvedValue;
    }
  }
  return resolved;
}

/**
 * Acquire a session token by posting to the login URL.
 *
 * @param auth - Auth config with login_url, login_body, and optional token_path
 * @returns SessionResult with token or error
 */
export async function acquireSessionToken(auth: ServiceAuth): Promise<SessionResult> {
  if (!auth.login_url || !auth.login_body) {
    return {
      success: false,
      error: 'Missing required fields: login_url, login_body',
    };
  }

  // Validate URL format
  try {
    new URL(auth.login_url);
  } catch {
    return {
      success: false,
      error: `Invalid login_url: ${auth.login_url}`,
    };
  }

  try {
    // Resolve EnvRef values in login_body before sending
    const resolvedBody = resolveLoginBody(auth.login_body);

    const response = await fetch(auth.login_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

    // Extract token using path (default: "access_token")
    const tokenPath = auth.token_path ?? 'access_token';
    const token = extractFromPath(data, tokenPath);

    if (!token || typeof token !== 'string') {
      return {
        success: false,
        error: `Token not found at path "${tokenPath}" in login response`,
      };
    }

    // Check for expires_in
    let expiresAt: number | undefined;
    const expiresIn = extractFromPath(data, 'expires_in');
    if (typeof expiresIn === 'number') {
      expiresAt = Date.now() + expiresIn * 1000;
    }

    return {
      success: true,
      token,
      expires_at: expiresAt,
    };
  } catch (error) {
    return {
      success: false,
      error: `Session login error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Acquire a session token and store it.
 */
export async function acquireAndStore(
  serviceName: string,
  currentAuth: ServiceAuth
): Promise<ServiceAuth | null> {
  const result = await acquireSessionToken(currentAuth);

  if (!result.success || !result.token) {
    return null;
  }

  const updatedAuth: ServiceAuth = {
    ...currentAuth,
    access_token: result.token,
    expires_at: result.expires_at,
  };

  await setServiceSecret(serviceName, updatedAuth);
  return updatedAuth;
}
