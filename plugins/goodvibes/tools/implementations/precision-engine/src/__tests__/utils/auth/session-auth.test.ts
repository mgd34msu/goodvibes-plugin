import { describe, it, expect, vi } from 'vitest';
import {
  extractFromPath,
  canAcquireSession,
  acquireSessionToken,
} from '../../../utils/fetch/auth/session-auth.js';

describe('session-auth', () => {
  describe('extractFromPath', () => {
    it('should extract nested value', () => {
      const obj = { data: { token: 'abc', nested: { deep: 'value' } } };
      expect(extractFromPath(obj, 'data.token')).toBe('abc');
      expect(extractFromPath(obj, 'data.nested.deep')).toBe('value');
    });

    it('should return undefined for missing path', () => {
      expect(extractFromPath({ a: 1 }, 'b')).toBeUndefined();
      expect(extractFromPath({ a: 1 }, 'a.b')).toBeUndefined();
    });

    it('should handle null/undefined input', () => {
      expect(extractFromPath(null, 'a')).toBeUndefined();
      expect(extractFromPath(undefined, 'a')).toBeUndefined();
    });

    it('should extract top-level value', () => {
      expect(extractFromPath({ access_token: 'tok' }, 'access_token')).toBe('tok');
    });
  });

  describe('canAcquireSession', () => {
    it('should return true when login_url and login_body present', () => {
      expect(
        canAcquireSession({
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { username: 'admin', password: 'pass' },
        })
      ).toBe(true);
    });

    it('should return false without login_url', () => {
      expect(
        canAcquireSession({
          type: 'session',
          login_body: { username: 'admin' },
        })
      ).toBe(false);
    });
  });

  describe('acquireSessionToken', () => {
    it('should return error for missing fields', async () => {
      const result = await acquireSessionToken({ type: 'session' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should handle successful login', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'session-token',
          expires_in: 1800,
        }),
      } as Response);

      try {
        const result = await acquireSessionToken({
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { username: 'admin', password: 'secret' },
        });
        expect(result.success).toBe(true);
        expect(result.token).toBe('session-token');
        expect(result.expires_at).toBeGreaterThan(Date.now());
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should extract token from custom path', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { auth: { token: 'deep-token' } },
        }),
      } as Response);

      try {
        const result = await acquireSessionToken({
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { email: 'test@example.com' },
          token_path: 'data.auth.token',
        });
        expect(result.success).toBe(true);
        expect(result.token).toBe('deep-token');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle login failure', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      } as Response);

      try {
        const result = await acquireSessionToken({
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { username: 'admin', password: 'wrong' },
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('403');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle network errors', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      try {
        const result = await acquireSessionToken({
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { username: 'admin' },
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Connection refused');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
