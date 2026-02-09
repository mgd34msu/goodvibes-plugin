import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTokenExpired,
  canRefreshToken,
  refreshAccessToken,
} from '../../../utils/fetch/auth/oauth2-refresh.js';
import type { ServiceAuth } from '../../../utils/fetch/secrets-store.js';

describe('oauth2-refresh', () => {
  describe('isTokenExpired', () => {
    it('should return false when no expires_at', () => {
      expect(isTokenExpired({ type: 'oauth2' })).toBe(false);
    });

    it('should return false for future expiry', () => {
      expect(isTokenExpired({ type: 'oauth2', expires_at: Date.now() + 300000 })).toBe(false);
    });

    it('should return true for past expiry', () => {
      expect(isTokenExpired({ type: 'oauth2', expires_at: Date.now() - 1000 })).toBe(true);
    });

    it('should return true within 60s buffer', () => {
      expect(isTokenExpired({ type: 'oauth2', expires_at: Date.now() + 30000 })).toBe(true);
    });
  });

  describe('canRefreshToken', () => {
    it('should return true when all fields present', () => {
      expect(
        canRefreshToken({
          type: 'oauth2',
          refresh_token: 'rt',
          token_url: 'https://auth.com/token',
          client_id: 'cid',
        })
      ).toBe(true);
    });

    it('should return false when missing refresh_token', () => {
      expect(
        canRefreshToken({
          type: 'oauth2',
          token_url: 'https://auth.com/token',
          client_id: 'cid',
        })
      ).toBe(false);
    });

    it('should return false when missing token_url', () => {
      expect(
        canRefreshToken({
          type: 'oauth2',
          refresh_token: 'rt',
          client_id: 'cid',
        })
      ).toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return error for missing fields', async () => {
      const result = await refreshAccessToken({ type: 'oauth2' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should handle network errors', async () => {
      // Mock fetch to simulate network error
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        const result = await refreshAccessToken({
          type: 'oauth2',
          refresh_token: 'rt',
          token_url: 'https://auth.example.com/token',
          client_id: 'cid',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network error');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle successful refresh', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      } as Response);

      try {
        const result = await refreshAccessToken({
          type: 'oauth2',
          refresh_token: 'old-rt',
          token_url: 'https://auth.example.com/token',
          client_id: 'cid',
          client_secret: 'csecret',
        });
        expect(result.success).toBe(true);
        expect(result.access_token).toBe('new-token');
        expect(result.refresh_token).toBe('new-refresh');
        expect(result.expires_at).toBeGreaterThan(Date.now());
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle HTTP error response', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid refresh token',
      } as Response);

      try {
        const result = await refreshAccessToken({
          type: 'oauth2',
          refresh_token: 'bad-rt',
          token_url: 'https://auth.example.com/token',
          client_id: 'cid',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('401');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
