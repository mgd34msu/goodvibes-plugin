/**
 * Static auth (Tier 1) — pre-configured credentials applied to headers.
 *
 * Ported verbatim from v1 precision-engine `utils/fetch/auth/static-auth.ts`.
 * Bearer / Basic / API-key / custom-headers, with `$env` resolution.
 */

import { resolveSecretValue, type ServiceAuth, type EnvRef } from '../secrets-store.js';

/** Apply a bearer token. Returns true when a non-empty token was applied. */
export function applyBearerAuth(headers: Record<string, string>, token: string | EnvRef): boolean {
  const resolved = resolveSecretValue(token);
  if (!resolved?.trim()) {return false;}
  headers['Authorization'] = `Bearer ${resolved}`;
  return true;
}

/** Apply HTTP basic auth. Returns true when both credentials resolved. */
export function applyBasicAuth(
  headers: Record<string, string>,
  username: string | EnvRef,
  password: string | EnvRef,
): boolean {
  const user = resolveSecretValue(username);
  const pass = resolveSecretValue(password);
  if (!user?.trim() || !pass?.trim()) {return false;}
  const encoded = Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64');
  headers['Authorization'] = `Basic ${encoded}`;
  return true;
}

/** Apply an API key via a named header. Returns true when the key resolved. */
export function applyApiKeyAuth(
  headers: Record<string, string>,
  headerName: string,
  key: string | EnvRef,
): boolean {
  const resolved = resolveSecretValue(key);
  if (!resolved?.trim()) {return false;}
  headers[headerName] = resolved;
  return true;
}

/** Apply custom headers. Returns true when at least one value resolved. */
export function applyCustomHeaders(
  headers: Record<string, string>,
  customHeaders: Record<string, string | EnvRef>,
): boolean {
  if (Object.keys(customHeaders).length === 0) {return false;}

  let applied = false;
  for (const [key, value] of Object.entries(customHeaders)) {
    const resolved = resolveSecretValue(value);
    if (resolved?.trim()) {
      headers[key] = resolved;
      applied = true;
    }
  }
  return applied;
}

/**
 * Apply static auth by type. Returns true when applied, false when credentials
 * were missing (caller may fall through to higher tiers).
 */
export function applyStaticAuth(headers: Record<string, string>, auth: ServiceAuth): boolean {
  switch (auth.type) {
    case 'bearer':
      if (!auth.token) {return false;}
      return applyBearerAuth(headers, auth.token);
    case 'basic':
      if (!auth.username || !auth.password) {return false;}
      return applyBasicAuth(headers, auth.username, auth.password);
    case 'api-key':
      if (!auth.header || !auth.key) {return false;}
      return applyApiKeyAuth(headers, auth.header, auth.key);
    case 'custom-headers':
      if (!auth.headers) {return false;}
      return applyCustomHeaders(headers, auth.headers);
    case 'none':
      return true;
    default:
      return false;
  }
}
