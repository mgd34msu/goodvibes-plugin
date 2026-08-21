/**
 * Auth orchestrator, coordinates the auth tiers and 401 recovery.
 *
 * Ported verbatim from v1 precision-engine
 * `utils/fetch/auth/auth-orchestrator.ts` (per-request override → service auth →
 * cookies; bounded OAuth2 refresh / session re-acquire on 401). The
 * `api_request` tool wraps a 401 retry around `handleAuthFailure` with its OWN
 * timeout (the §1.8 fix), so a stuck retry can never hang the batch.
 */

import { applyStaticAuth } from './static-auth.js';
import { isTokenExpired, canRefreshToken, refreshAndStore } from './oauth2-refresh.js';
import { canAcquireSession, acquireAndStore } from './session-auth.js';
import { getServiceSecrets, type OAuth2Auth } from '../secrets-store.js';
import { globalCookieJar } from '../cookie-jar.js';
import type { RequestAuth } from '../request-builder.js';

/**
 * Refreshes in flight, keyed by service name.
 *
 * `api_request` runs a batch through `Promise.all`, so N entries for one
 * service with an expired token would each fire their own refresh_token grant.
 * Providers that rotate the refresh token on use invalidate it for the losers
 * of that race, and those entries fall back to the expired access token and
 * return spurious 401s. Concurrent callers share one grant instead.
 */
const refreshesInFlight = new Map<string, Promise<OAuth2Auth | null>>();

/** Refresh a service's token, joining a refresh already running for it. */
async function refreshOnce(serviceName: string, auth: OAuth2Auth): Promise<OAuth2Auth | null> {
  const running = refreshesInFlight.get(serviceName);
  if (running) {return running;}

  const pending = refreshAndStore(serviceName, auth);
  refreshesInFlight.set(serviceName, pending);
  try {
    return await pending;
  } finally {
    refreshesInFlight.delete(serviceName);
  }
}

/** Auth status enum. */
export type AuthStatus =
  | 'valid'
  | 'expired'
  | 'needs_refresh'
  | 'needs_browser_auth'
  | 'no_credentials'
  | 'no_auth_configured';

/**
 * Apply authentication to request headers.
 * Order: per-request override → service auth (OAuth2 auto-refresh) → cookies.
 * @returns true when any auth was applied
 */
export async function applyAuth(
  headers: Record<string, string>,
  url: string,
  requestAuth?: RequestAuth,
  serviceName?: string,
): Promise<boolean> {
  let authApplied = false;

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
            'utf-8',
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
  } else if (serviceName) {
    const auth = await getServiceSecrets(serviceName);
    if (auth) {
      if (auth.type === 'oauth2') {
        let currentAuth = auth;
        if (isTokenExpired(currentAuth) && canRefreshToken(currentAuth)) {
          const refreshedAuth = await refreshOnce(serviceName, currentAuth);
          if (refreshedAuth) {currentAuth = refreshedAuth;}
        }
        if (currentAuth.access_token?.trim()) {
          headers['Authorization'] = `Bearer ${currentAuth.access_token}`;
          authApplied = true;
        }
      } else if (auth.type === 'session') {
        if (auth.access_token?.trim()) {
          headers['Authorization'] = `Bearer ${auth.access_token}`;
          authApplied = true;
        }
      } else {
        const staticApplied = applyStaticAuth(headers, auth);
        authApplied = authApplied || staticApplied;
      }
    }
  }

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
    // Cookie retrieval is best-effort.
  }

  return authApplied;
}

/**
 * Handle a 401 by refreshing or re-acquiring. Caller enforces max 1 retry.
 * @returns { retry, hint? }, whether to retry, and an optional recovery hint
 */
export async function handleAuthFailure(
  response: { status: number },
  serviceName?: string,
): Promise<{ retry: boolean; hint?: string }> {
  if (response.status !== 401) {return { retry: false };}
  if (!serviceName) {return { retry: false };}

  try {
    const auth = await getServiceSecrets(serviceName);
    if (!auth) {return { retry: false };}

    if (auth.type === 'oauth2') {
      if (canRefreshToken(auth)) {
        const refreshed = await refreshOnce(serviceName, auth);
        if (refreshed) {return { retry: true };}
      }
      return { retry: false, hint: 'needs_browser_auth' };
    }

    if (auth.type === 'session') {
      if (canAcquireSession(auth)) {
        const acquired = await acquireAndStore(serviceName, auth);
        if (acquired) {return { retry: true };}
      }
      return { retry: false };
    }

    return { retry: false };
  } catch {
    return { retry: false };
  }
}

/** Report the auth health of a service. */
export async function getAuthStatus(serviceName: string): Promise<AuthStatus> {
  try {
    const auth = await getServiceSecrets(serviceName);
    if (!auth) {return 'no_auth_configured';}

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

    if (!hasCredentials) {return 'no_credentials';}

    if (auth.type === 'oauth2') {
      if (isTokenExpired(auth)) {
        if (canRefreshToken(auth)) {return 'needs_refresh';}
        return 'needs_browser_auth';
      }
    }

    if ('expires_at' in auth && typeof auth.expires_at === 'number') {
      if (auth.expires_at < Date.now()) {
        if (auth.type !== 'oauth2' && !('login_url' in auth)) {return 'expired';}
      }
    }

    return 'valid';
  } catch {
    return 'no_auth_configured';
  }
}
