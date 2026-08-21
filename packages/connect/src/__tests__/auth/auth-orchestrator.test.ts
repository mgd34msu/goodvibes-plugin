/**
 * Ported from v1 precision-engine
 * `__tests__/utils/auth/auth-orchestrator.test.ts` (mock/import paths only).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { applyAuth, handleAuthFailure, getAuthStatus } from '../../fetch/auth/auth-orchestrator.js';
import type { ServiceAuth } from '../../fetch/secrets-store.js';
import type { RequestAuth } from '../../fetch/request-builder.js';
import type { StoredCookie } from '../../fetch/cookie-jar.js';

vi.mock('../../fetch/auth/static-auth.js', () => ({ applyStaticAuth: vi.fn() }));
vi.mock('../../fetch/auth/oauth2-refresh.js', () => ({
  isTokenExpired: vi.fn(),
  canRefreshToken: vi.fn(),
  refreshAndStore: vi.fn(),
}));
vi.mock('../../fetch/auth/session-auth.js', () => ({ canAcquireSession: vi.fn(), acquireAndStore: vi.fn() }));
vi.mock('../../fetch/secrets-store.js', () => ({ getServiceSecrets: vi.fn() }));
vi.mock('../../fetch/cookie-jar.js', () => ({
  globalCookieJar: { getCookies: vi.fn(), toCookieHeader: vi.fn() },
}));

import { applyStaticAuth } from '../../fetch/auth/static-auth.js';
import { isTokenExpired, canRefreshToken, refreshAndStore } from '../../fetch/auth/oauth2-refresh.js';
import { canAcquireSession, acquireAndStore } from '../../fetch/auth/session-auth.js';
import { getServiceSecrets } from '../../fetch/secrets-store.js';
import { globalCookieJar } from '../../fetch/cookie-jar.js';

describe('auth-orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyAuth', () => {
    it('should apply per-request bearer auth', async () => {
      const headers: Record<string, string> = {};
      const requestAuth: RequestAuth = { type: 'bearer', token: 'test-token' };
      const result = await applyAuth(headers, 'https://api.example.com', requestAuth);
      expect(result).toBe(true);
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('should apply per-request basic auth', async () => {
      const headers: Record<string, string> = {};
      const requestAuth: RequestAuth = { type: 'basic', username: 'user', password: 'pass' };
      const result = await applyAuth(headers, 'https://api.example.com', requestAuth);
      expect(result).toBe(true);
      expect(headers['Authorization']).toMatch(/^Basic /);
      expect(Buffer.from(headers['Authorization'].split(' ')[1], 'base64').toString('utf-8')).toBe('user:pass');
    });

    it('should apply per-request api-key auth', async () => {
      const headers: Record<string, string> = {};
      const requestAuth: RequestAuth = { type: 'api-key', header: 'X-API-Key', key: 'secret-key' };
      const result = await applyAuth(headers, 'https://api.example.com', requestAuth);
      expect(result).toBe(true);
      expect(headers['X-API-Key']).toBe('secret-key');
    });

    it('should apply per-request custom-headers', async () => {
      const headers: Record<string, string> = {};
      const requestAuth: RequestAuth = {
        type: 'custom-headers',
        headers: { 'X-Custom': 'value1', 'X-Another': 'value2' },
      };
      const result = await applyAuth(headers, 'https://api.example.com', requestAuth);
      expect(result).toBe(true);
      expect(headers['X-Custom']).toBe('value1');
      expect(headers['X-Another']).toBe('value2');
    });

    it('should skip auth when per-request type is none', async () => {
      const headers: Record<string, string> = {};
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      const result = await applyAuth(headers, 'https://api.example.com', { type: 'none' });
      expect(result).toBe(false);
      expect(Object.keys(headers).length).toBe(0);
    });

    it('should apply service auth with bearer token', async () => {
      const headers: Record<string, string> = {};
      const auth: ServiceAuth = { type: 'bearer', token: 'service-token' };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (applyStaticAuth as Mock).mockReturnValue(true);
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      const result = await applyAuth(headers, 'https://api.example.com', undefined, 'test-service');
      expect(result).toBe(true);
      expect(applyStaticAuth).toHaveBeenCalledWith(headers, auth);
    });

    it('should refresh expired oauth2 token before applying', async () => {
      const headers: Record<string, string> = {};
      const auth: ServiceAuth = { type: 'oauth2', access_token: 'old-token', expires_at: Date.now() - 1000 };
      const refreshedAuth: ServiceAuth = { ...auth, access_token: 'new-token', expires_at: Date.now() + 3600000 };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (isTokenExpired as Mock).mockReturnValue(true);
      (canRefreshToken as Mock).mockReturnValue(true);
      (refreshAndStore as Mock).mockResolvedValue(refreshedAuth);
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      const result = await applyAuth(headers, 'https://api.example.com', undefined, 'test-service');
      expect(result).toBe(true);
      expect(headers['Authorization']).toBe('Bearer new-token');
      expect(refreshAndStore).toHaveBeenCalledWith('test-service', auth);
    });

    it('issues one refresh grant for concurrent requests to the same service', async () => {
      const auth: ServiceAuth = { type: 'oauth2', access_token: 'old-token', expires_at: Date.now() - 1000 };
      const refreshedAuth: ServiceAuth = { ...auth, access_token: 'new-token', expires_at: Date.now() + 3600000 };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (isTokenExpired as Mock).mockReturnValue(true);
      (canRefreshToken as Mock).mockReturnValue(true);
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      // A grant that takes a tick, the window in which a batch would fire N of them.
      (refreshAndStore as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(refreshedAuth), 10)),
      );

      const batch = [{}, {}, {}, {}].map((headers: Record<string, string>) =>
        applyAuth(headers, 'https://api.example.com', undefined, 'test-service').then(() => headers),
      );
      const results = await Promise.all(batch);

      expect(refreshAndStore).toHaveBeenCalledTimes(1);
      for (const headers of results) {
        expect(headers['Authorization']).toBe('Bearer new-token');
      }
    });

    it('refreshes again once the previous grant has settled', async () => {
      const auth: ServiceAuth = { type: 'oauth2', access_token: 'old-token', expires_at: Date.now() - 1000 };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (isTokenExpired as Mock).mockReturnValue(true);
      (canRefreshToken as Mock).mockReturnValue(true);
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      (refreshAndStore as Mock).mockResolvedValue({ ...auth, access_token: 'new-token' });

      await applyAuth({}, 'https://api.example.com', undefined, 'test-service');
      await applyAuth({}, 'https://api.example.com', undefined, 'test-service');

      expect(refreshAndStore).toHaveBeenCalledTimes(2);
    });

    it('keeps refreshes for different services independent', async () => {
      const auth: ServiceAuth = { type: 'oauth2', access_token: 'old-token', expires_at: Date.now() - 1000 };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (isTokenExpired as Mock).mockReturnValue(true);
      (canRefreshToken as Mock).mockReturnValue(true);
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      (refreshAndStore as Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ...auth, access_token: 'new-token' }), 10)),
      );

      await Promise.all([
        applyAuth({}, 'https://a.example.com', undefined, 'service-a'),
        applyAuth({}, 'https://b.example.com', undefined, 'service-b'),
      ]);

      expect(refreshAndStore).toHaveBeenCalledTimes(2);
    });

    it('should apply cookies alongside other auth', async () => {
      const headers: Record<string, string> = {};
      const requestAuth: RequestAuth = { type: 'bearer', token: 'test-token' };
      const cookies: StoredCookie[] = [{ name: 'session', value: 'abc123', domain: 'example.com', path: '/' }];
      (globalCookieJar.getCookies as Mock).mockResolvedValue(cookies);
      (globalCookieJar.toCookieHeader as Mock).mockReturnValue('session=abc123');
      const result = await applyAuth(headers, 'https://api.example.com', requestAuth);
      expect(result).toBe(true);
      expect(headers['Authorization']).toBe('Bearer test-token');
      expect(headers['Cookie']).toBe('session=abc123');
    });

    it('should return false when no auth is applied', async () => {
      const headers: Record<string, string> = {};
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      const result = await applyAuth(headers, 'https://api.example.com');
      expect(result).toBe(false);
      expect(Object.keys(headers).length).toBe(0);
    });
  });

  describe('handleAuthFailure', () => {
    it('should return retry false for non-401 status', async () => {
      expect(await handleAuthFailure({ status: 403 }, 'test-service')).toEqual({ retry: false });
    });

    it('should return retry false when no service name provided', async () => {
      expect(await handleAuthFailure({ status: 401 })).toEqual({ retry: false });
    });

    it('should refresh oauth2 token and return retry true', async () => {
      const auth: ServiceAuth = {
        type: 'oauth2',
        access_token: 'old-token',
        refresh_token: 'refresh-token',
        token_url: 'https://auth.example.com/token',
        client_id: 'client-id',
      };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (canRefreshToken as Mock).mockReturnValue(true);
      (refreshAndStore as Mock).mockResolvedValue({ ...auth, access_token: 'new-token' });
      expect(await handleAuthFailure({ status: 401 }, 'test-service')).toEqual({ retry: true });
      expect(refreshAndStore).toHaveBeenCalledWith('test-service', auth);
    });

    it('should acquire session token and return retry true', async () => {
      const auth: ServiceAuth = {
        type: 'session',
        login_url: 'https://api.example.com/login',
        login_body: { username: 'user', password: 'pass' },
      };
      (getServiceSecrets as Mock).mockResolvedValue(auth);
      (canAcquireSession as Mock).mockReturnValue(true);
      (acquireAndStore as Mock).mockResolvedValue({ ...auth, access_token: 'session-token' });
      expect(await handleAuthFailure({ status: 401 }, 'test-service')).toEqual({ retry: true });
      expect(acquireAndStore).toHaveBeenCalledWith('test-service', auth);
    });

    it('should return needs_browser_auth hint for oauth2 without refresh', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({ type: 'oauth2', access_token: 'expired-token' });
      (canRefreshToken as Mock).mockReturnValue(false);
      expect(await handleAuthFailure({ status: 401 }, 'test-service')).toEqual({
        retry: false,
        hint: 'needs_browser_auth',
      });
    });

    it('should return retry false for static auth failure', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({ type: 'bearer', token: 'bad-token' });
      expect(await handleAuthFailure({ status: 401 }, 'test-service')).toEqual({ retry: false });
    });
  });

  describe('getAuthStatus', () => {
    it('should return no_auth_configured when auth is missing', async () => {
      (getServiceSecrets as Mock).mockResolvedValue(undefined);
      expect(await getAuthStatus('test-service')).toBe('no_auth_configured');
    });

    it('should return no_credentials for bearer without token', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({ type: 'bearer' });
      expect(await getAuthStatus('test-service')).toBe('no_credentials');
    });

    it('should return no_credentials for oauth2 without access_token', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({ type: 'oauth2' });
      expect(await getAuthStatus('test-service')).toBe('no_credentials');
    });

    it('should return needs_refresh for expired oauth2 with refresh capability', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({
        type: 'oauth2',
        access_token: 'expired-token',
        expires_at: Date.now() - 1000,
        refresh_token: 'refresh-token',
        token_url: 'https://auth.example.com/token',
        client_id: 'client-id',
      });
      (isTokenExpired as Mock).mockReturnValue(true);
      (canRefreshToken as Mock).mockReturnValue(true);
      expect(await getAuthStatus('test-service')).toBe('needs_refresh');
    });

    it('should return needs_browser_auth for expired oauth2 without refresh', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({
        type: 'oauth2',
        access_token: 'expired-token',
        expires_at: Date.now() - 1000,
      });
      (isTokenExpired as Mock).mockReturnValue(true);
      (canRefreshToken as Mock).mockReturnValue(false);
      expect(await getAuthStatus('test-service')).toBe('needs_browser_auth');
    });

    it('should return valid for static auth with credentials', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({ type: 'bearer', token: 'valid-token' });
      expect(await getAuthStatus('test-service')).toBe('valid');
    });

    it('should return valid for non-expired oauth2', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({
        type: 'oauth2',
        access_token: 'valid-token',
        expires_at: Date.now() + 3600000,
      });
      (isTokenExpired as Mock).mockReturnValue(false);
      expect(await getAuthStatus('test-service')).toBe('valid');
    });
  });

  describe('edge cases', () => {
    it('should return false for empty bearer token', async () => {
      const headers: Record<string, string> = {};
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      expect(await applyAuth(headers, 'https://api.example.com', { type: 'bearer', token: '' })).toBe(false);
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should return false for whitespace-only bearer token', async () => {
      const headers: Record<string, string> = {};
      (globalCookieJar.getCookies as Mock).mockResolvedValue([]);
      expect(await applyAuth(headers, 'https://api.example.com', { type: 'bearer', token: '   ' })).toBe(false);
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should return no_auth_configured when getServiceSecrets throws', async () => {
      (getServiceSecrets as Mock).mockRejectedValue(new Error('Filesystem error'));
      expect(await getAuthStatus('test-service')).toBe('no_auth_configured');
    });

    it('should return expired for non-OAuth2 expired token without refresh', async () => {
      (getServiceSecrets as Mock).mockResolvedValue({
        type: 'bearer',
        token: 'expired-token',
        expires_at: Date.now() - 1000,
      });
      expect(await getAuthStatus('test-service')).toBe('expired');
    });

    it('should return retry false when getServiceSecrets returns undefined', async () => {
      (getServiceSecrets as Mock).mockResolvedValue(undefined);
      expect(await handleAuthFailure({ status: 401 }, 'test-service')).toEqual({ retry: false });
    });

    it('should return retry false when getServiceSecrets throws', async () => {
      (getServiceSecrets as Mock).mockRejectedValue(new Error('Filesystem error'));
      expect(await handleAuthFailure({ status: 401 }, 'test-service')).toEqual({ retry: false });
    });
  });
});
