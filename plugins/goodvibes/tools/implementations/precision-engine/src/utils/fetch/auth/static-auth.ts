/**
 * Static auth — Tier 1 authentication.
 * Applies pre-configured credentials to request headers.
 * Supports bearer tokens, basic auth, API keys, and custom headers.
 */

import { resolveSecretValue, type ServiceAuth, type EnvRef } from '../secrets-store.js';

/**
 * Apply bearer token authentication.
 */
export function applyBearerAuth(headers: Record<string, string>, token: string | EnvRef): boolean {
  const resolved = resolveSecretValue(token);
  if (!resolved) return false;
  headers['Authorization'] = `Bearer ${resolved}`;
  return true;
}

/**
 * Apply basic authentication.
 */
export function applyBasicAuth(
  headers: Record<string, string>,
  username: string | EnvRef,
  password: string | EnvRef
): boolean {
  const user = resolveSecretValue(username);
  const pass = resolveSecretValue(password);
  if (!user || !pass) return false;
  const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
  headers['Authorization'] = `Basic ${encoded}`;
  return true;
}

/**
 * Apply API key authentication via custom header.
 */
export function applyApiKeyAuth(
  headers: Record<string, string>,
  headerName: string,
  key: string | EnvRef
): boolean {
  const resolved = resolveSecretValue(key);
  if (!resolved) return false;
  headers[headerName] = resolved;
  return true;
}

/**
 * Apply custom header authentication.
 */
export function applyCustomHeaders(
  headers: Record<string, string>,
  customHeaders: Record<string, string | EnvRef>
): boolean {
  let applied = false;
  for (const [key, value] of Object.entries(customHeaders)) {
    const resolved = resolveSecretValue(value);
    if (resolved) {
      headers[key] = resolved;
      applied = true;
    }
  }
  return applied;
}

/**
 * Apply static auth based on auth config type.
 * Returns true if auth was successfully applied, false if credentials were missing.
 */
export function applyStaticAuth(headers: Record<string, string>, auth: ServiceAuth): boolean {
  switch (auth.type) {
    case 'bearer':
      if (!auth.token) return false;
      return applyBearerAuth(headers, auth.token);
      
    case 'basic':
      if (!auth.username || !auth.password) return false;
      return applyBasicAuth(headers, auth.username, auth.password);
      
    case 'api-key':
      if (!auth.header || !auth.key) return false;
      return applyApiKeyAuth(headers, auth.header, auth.key);
      
    case 'custom-headers':
      if (!auth.headers) return false;
      return applyCustomHeaders(headers, auth.headers);
      
    case 'none':
      return true; // No auth needed, success
      
    default:
      return false; // Unknown type, let higher tiers handle
  }
}
