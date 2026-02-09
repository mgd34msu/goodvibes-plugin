/**
 * OAuth2 token refresh — Tier 2 authentication.
 * Handles automatic access token refresh using refresh_token + client credentials.
 */

import { type ServiceAuth } from '../secrets-store.js';
import { setServiceSecret } from '../secrets-store.js';

/** Token refresh result */
export interface TokenRefreshResult {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
}

/**
 * Check if an access token is expired or about to expire.
 * Uses a 60-second buffer to avoid using nearly-expired tokens.
 */
export function isTokenExpired(auth: ServiceAuth): boolean {
  if (!auth.expires_at) return false; // No expiry info, assume valid
  const buffer = 60 * 1000; // 60 seconds
  return Date.now() + buffer >= auth.expires_at;
}

/**
 * Check if an auth config has the requirements for token refresh.
 */
export function canRefreshToken(auth: ServiceAuth): boolean {
  return !!(auth.refresh_token && auth.token_url && auth.client_id);
}

/**
 * Refresh an OAuth2 access token using the refresh_token grant.
 *
 * @param auth - Current auth config with refresh_token, token_url, client_id, client_secret
 * @returns TokenRefreshResult with new tokens or error
 */
export async function refreshAccessToken(auth: ServiceAuth): Promise<TokenRefreshResult> {
  if (!auth.refresh_token || !auth.token_url || !auth.client_id) {
    return {
      success: false,
      error: 'Missing required fields: refresh_token, token_url, client_id',
    };
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refresh_token,
      client_id: typeof auth.client_id === 'string' ? auth.client_id : '',
    });

    // Add client_secret if available
    if (auth.client_secret) {
      body.set('client_secret', typeof auth.client_secret === 'string' ? auth.client_secret : '');
    }

    const response = await fetch(auth.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
      return {
        success: false,
        error: 'Token refresh response missing access_token',
      };
    }

    // Calculate expiry
    let expiresAt: number | undefined;
    if (typeof data.expires_in === 'number') {
      expiresAt = Date.now() + data.expires_in * 1000;
    }

    return {
      success: true,
      access_token: accessToken,
      refresh_token: (data.refresh_token as string) ?? auth.refresh_token, // Use new refresh token if provided
      expires_at: expiresAt,
    };
  } catch (error) {
    return {
      success: false,
      error: `Token refresh error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Refresh tokens and update the stored auth config for a service.
 *
 * @param serviceName - Name of the service to update
 * @param currentAuth - Current auth configuration
 * @returns Updated auth config or null on failure
 */
export async function refreshAndStore(
  serviceName: string,
  currentAuth: ServiceAuth
): Promise<ServiceAuth | null> {
  const result = await refreshAccessToken(currentAuth);

  if (!result.success || !result.access_token) {
    return null;
  }

  // Update stored auth
  const updatedAuth: ServiceAuth = {
    ...currentAuth,
    access_token: result.access_token,
    refresh_token: result.refresh_token ?? currentAuth.refresh_token,
    expires_at: result.expires_at,
  };

  await setServiceSecret(serviceName, updatedAuth);
  return updatedAuth;
}
