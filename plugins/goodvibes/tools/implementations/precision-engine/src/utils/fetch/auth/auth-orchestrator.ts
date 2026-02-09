/**
 * Auth orchestrator — coordinates all auth tiers and handles auth failures.
 * Orchestrates static auth, OAuth2 refresh, session acquisition, and cookie management.
 */

import { applyStaticAuth } from './static-auth.js';
import { isTokenExpired, canRefreshToken, refreshAndStore } from './oauth2-refresh.js';
import { canAcquireSession, acquireAndStore } from './session-auth.js';
import { getServiceSecrets } from '../secrets-store.js';
import { globalCookieJar } from '../cookie-jar.js';
import type { RequestAuth } from '../request-builder.js';

/** Auth status enum */
export type AuthStatus =
  | 'valid'
  | 'expired'
  | 'needs_refresh'
  | 'needs_browser_auth'
  | 'no_credentials'
  | 'no_auth_configured';

/**
 * Apply authentication to request headers.
 *
 * Determines auth strategy in this order:
 * 1. Per-request auth override (requestAuth parameter)
 * 2. Service-level auth (via serviceName)
 * 3. Cookies (always applied)
 *
 * For OAuth2 service auth: auto-refreshes expired tokens before applying.
 *
 * @param headers - Request headers to modify
 * @param url - Request URL (for cookie matching)
 * @param requestAuth - Optional per-request auth override
 * @param serviceName - Optional service name for service-level auth
 * @returns True if any auth was applied, false otherwise
 */
export async function applyAuth(
  headers: Record<string, string>,
  url: string,
  requestAuth?: RequestAuth,
  serviceName?: string
): Promise<boolean> {
  let authApplied = false;

  // 1. Per-request auth override
  if (requestAuth && requestAuth.type !== 'none') {
    switch (requestAuth.type) {
      case 'bearer':
        if (requestAuth.token?.trim()) {
          headers['Authorization'] = `Bearer ${requestAuth.token}`;
          authApplied = true;
        }
        break;
      case 'basic':
        if (requestAuth.username?.trim() && requestAuth.password?.trim()) {
          const encoded = Buffer.from(
            `${requestAuth.username}:${requestAuth.password}`,
            'utf-8'
          ).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
          authApplied = true;
        }
        break;
      case 'api-key':
        if (requestAuth.header?.trim() && requestAuth.key?.trim()) {
          headers[requestAuth.header] = requestAuth.key;
          authApplied = true;
        }
        break;
      case 'custom-headers':
        if (requestAuth.headers && Object.keys(requestAuth.headers).length > 0) {
          Object.assign(headers, requestAuth.headers);
          authApplied = true;
        }
        break;
    }
  }
  // 2. Service-level auth
  else if (serviceName) {
    const auth = await getServiceSecrets(serviceName);
    if (auth) {
      // Handle OAuth2 with auto-refresh
      if (auth.type === 'oauth2') {
        let currentAuth = auth;

        // Refresh if expired
        if (isTokenExpired(currentAuth) && canRefreshToken(currentAuth)) {
          const refreshedAuth = await refreshAndStore(serviceName, currentAuth);
          if (refreshedAuth) {
            currentAuth = refreshedAuth;
          }
        }

        // Apply access token as bearer
        if (currentAuth.access_token?.trim()) {
          headers['Authorization'] = `Bearer ${currentAuth.access_token}`;
          authApplied = true;
        }
      }
      // Handle session auth
      else if (auth.type === 'session') {
        if (auth.access_token?.trim()) {
          headers['Authorization'] = `Bearer ${auth.access_token}`;
          authApplied = true;
        }
      }
      // Handle static auth (bearer, basic, api-key, custom-headers)
      else {
        const staticApplied = applyStaticAuth(headers, auth);
        authApplied = authApplied || staticApplied;
      }
    }
  }

  // 3. Always apply cookies
  try {
    const cookies = await globalCookieJar.getCookies(url);
    if (cookies.length > 0) {
      const cookieHeader = globalCookieJar.toCookieHeader(cookies);
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
        authApplied = true;
      }
    }
  } catch {
    // Cookie retrieval is best-effort, don't fail the request
  }

  return authApplied;
}

/**
 * Handle authentication failure (401 response).
 *
 * Attempts to recover by refreshing tokens or acquiring new sessions.
 * Returns whether the request should be retried.
 *
 * Caller must enforce max 1 retry per request.
 *
 * @param response - Response object with status code
 * @param serviceName - Optional service name
 * @returns Object with retry flag and optional hint
 */
export async function handleAuthFailure(
  response: { status: number },
  serviceName?: string
): Promise<{ retry: boolean; hint?: string }> {
  // Only handle 401 Unauthorized
  if (response.status !== 401) {
    return { retry: false };
  }

  // No service name = no way to recover
  if (!serviceName) {
    return { retry: false };
  }

  try {
    const auth = await getServiceSecrets(serviceName);
    if (!auth) {
      return { retry: false };
    }

    // OAuth2: try to refresh
    if (auth.type === 'oauth2') {
      if (canRefreshToken(auth)) {
        const refreshed = await refreshAndStore(serviceName, auth);
        if (refreshed) {
          return { retry: true };
        }
      }
      // OAuth2 without refresh capability = needs browser auth
      return { retry: false, hint: 'needs_browser_auth' };
    }

    // Session: try to acquire new session
    if (auth.type === 'session') {
      if (canAcquireSession(auth)) {
        const acquired = await acquireAndStore(serviceName, auth);
        if (acquired) {
          return { retry: true };
        }
      }
      return { retry: false };
    }

    // Static auth failed = bad credentials
    return { retry: false };
  } catch {
    // Filesystem/JSON errors during secret retrieval or token refresh
    return { retry: false };
  }
}

/**
 * Get authentication status for a service.
 *
 * @param serviceName - Service name to check
 * @returns Status enum indicating auth health
 */
export async function getAuthStatus(serviceName: string): Promise<AuthStatus> {
  try {
    const auth = await getServiceSecrets(serviceName);

    // No auth configured
    if (!auth) {
      return 'no_auth_configured';
    }

    // Check for credentials based on auth type
    const hasCredentials = (() => {
      switch (auth.type) {
        case 'bearer':
          return !!auth.token;
        case 'basic':
          return !!(auth.username && auth.password);
        case 'api-key':
          return !!(auth.header && auth.key);
        case 'custom-headers':
          return !!(auth.headers && Object.keys(auth.headers).length > 0);
        case 'oauth2':
          return !!auth.access_token;
        case 'session':
          return !!auth.access_token;
        case 'none':
          return true;
        default:
          return false;
      }
    })();

    if (!hasCredentials) {
      return 'no_credentials';
    }

    // Check OAuth2 token expiration
    if (auth.type === 'oauth2') {
      if (isTokenExpired(auth)) {
        if (canRefreshToken(auth)) {
          return 'needs_refresh';
        }
        return 'needs_browser_auth';
      }
    }

    // Check for expired non-OAuth2 tokens without refresh mechanism
    if ('expires_at' in auth && typeof auth.expires_at === 'number') {
      if (auth.expires_at < Date.now()) {
        // Token is expired and no refresh mechanism available
        if (auth.type !== 'oauth2' && !('login_url' in auth)) {
          return 'expired';
        }
      }
    }

    return 'valid';
  } catch {
    // Filesystem/JSON errors during secret retrieval
    return 'no_auth_configured';
  }
}
