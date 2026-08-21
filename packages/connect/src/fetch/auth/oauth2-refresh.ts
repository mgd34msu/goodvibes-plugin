/**
 * OAuth2 token refresh (Tier 2).
 *
 * Ported verbatim from v1 precision-engine `utils/fetch/auth/oauth2-refresh.ts`.
 * Refreshes an access token from a refresh_token grant and stores the result.
 */

import { type OAuth2Auth, resolveSecretValue, setServiceSecret } from '../secrets-store.js';

/** Result of a token refresh. */
export interface TokenRefreshResult {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
}

/** True when the access token is expired or within a 60s buffer of expiry. */
export function isTokenExpired(auth: OAuth2Auth): boolean {
  if (!auth.expires_at) {return false;}
  const buffer = 60 * 1000;
  return Date.now() + buffer >= auth.expires_at;
}

/** True when the config has what it needs to refresh. */
export function canRefreshToken(auth: OAuth2Auth): boolean {
  return !!(auth.refresh_token && auth.token_url && auth.client_id);
}

/** Perform the refresh_token grant. */
export async function refreshAccessToken(auth: OAuth2Auth): Promise<TokenRefreshResult> {
  if (!auth.refresh_token || !auth.token_url || !auth.client_id) {
    return { success: false, error: 'Missing required fields: refresh_token, token_url, client_id' };
  }

  try {
    new URL(auth.token_url);
  } catch {
    return { success: false, error: `Invalid token_url: ${auth.token_url}` };
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refresh_token,
      client_id: resolveSecretValue(auth.client_id) ?? '',
    });

    if (auth.client_secret) {
      body.set('client_secret', resolveSecretValue(auth.client_secret) ?? '');
    }

    const response = await fetch(auth.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Token refresh failed: HTTP ${response.status} - ${errorText.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) {
      return { success: false, error: 'Token refresh response missing access_token' };
    }

    let expiresAt: number | undefined;
    if (typeof data.expires_in === 'number') {
      expiresAt = Date.now() + data.expires_in * 1000;
    }

    return {
      success: true,
      access_token: accessToken,
      refresh_token: (data.refresh_token as string) ?? auth.refresh_token,
      expires_at: expiresAt,
    };
  } catch (error) {
    return {
      success: false,
      error: `Token refresh error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Refresh tokens and persist the updated auth for a service. */
export async function refreshAndStore(
  serviceName: string,
  currentAuth: OAuth2Auth,
): Promise<OAuth2Auth | null> {
  const result = await refreshAccessToken(currentAuth);
  if (!result.success || !result.access_token) {return null;}

  const updatedAuth: OAuth2Auth = {
    ...currentAuth,
    access_token: result.access_token,
    refresh_token: result.refresh_token ?? currentAuth.refresh_token,
    expires_at: result.expires_at,
  };

  await setServiceSecret(serviceName, updatedAuth);
  return updatedAuth;
}
