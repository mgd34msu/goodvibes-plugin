import { describe, it, expect } from 'vitest';
import {
  applyBearerAuth,
  applyBasicAuth,
  applyApiKeyAuth,
  applyCustomHeaders,
  applyStaticAuth,
} from '../../../utils/fetch/auth/static-auth.js';

describe('static-auth', () => {
  describe('applyBearerAuth', () => {
    it('should set Authorization header with token', () => {
      const headers: Record<string, string> = {};
      const result = applyBearerAuth(headers, 'my-token');
      expect(result).toBe(true);
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('should resolve env ref', () => {
      process.env.TEST_AUTH_TOKEN = 'env-token';
      try {
        const headers: Record<string, string> = {};
        const result = applyBearerAuth(headers, { $env: 'TEST_AUTH_TOKEN' });
        expect(result).toBe(true);
        expect(headers['Authorization']).toBe('Bearer env-token');
      } finally {
        delete process.env.TEST_AUTH_TOKEN;
      }
    });

    it('should return false for missing env var', () => {
      const headers: Record<string, string> = {};
      const result = applyBearerAuth(headers, { $env: 'NONEXISTENT_VAR_12345' });
      expect(result).toBe(false);
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should reject whitespace-only token', () => {
      const headers: Record<string, string> = {};
      const result = applyBearerAuth(headers, '   ');
      expect(result).toBe(false);
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('applyBasicAuth', () => {
    it('should set Authorization header with base64 credentials', () => {
      const headers: Record<string, string> = {};
      const result = applyBasicAuth(headers, 'admin', 'secret');
      expect(result).toBe(true);
      const expected = 'Basic ' + Buffer.from('admin:secret', 'utf-8').toString('base64');
      expect(headers['Authorization']).toBe(expected);
    });

    it('should return false if username missing', () => {
      const headers: Record<string, string> = {};
      const result = applyBasicAuth(headers, { $env: 'NOPE_12345' }, 'pass');
      expect(result).toBe(false);
    });

    it('should return false if password missing', () => {
      const headers: Record<string, string> = {};
      const result = applyBasicAuth(headers, 'user', { $env: 'NOPE_12345' });
      expect(result).toBe(false);
    });

    it('should reject whitespace-only credentials', () => {
      const headers: Record<string, string> = {};
      const result = applyBasicAuth(headers, 'user', '  \t  ');
      expect(result).toBe(false);
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('applyApiKeyAuth', () => {
    it('should set custom header with key', () => {
      const headers: Record<string, string> = {};
      const result = applyApiKeyAuth(headers, 'X-API-Key', 'key-123');
      expect(result).toBe(true);
      expect(headers['X-API-Key']).toBe('key-123');
    });

    it('should resolve env ref', () => {
      process.env.TEST_API_KEY = 'env-key-456';
      try {
        const headers: Record<string, string> = {};
        const result = applyApiKeyAuth(headers, 'X-API-Key', { $env: 'TEST_API_KEY' });
        expect(result).toBe(true);
        expect(headers['X-API-Key']).toBe('env-key-456');
      } finally {
        delete process.env.TEST_API_KEY;
      }
    });

    it('should reject whitespace-only key', () => {
      const headers: Record<string, string> = {};
      const result = applyApiKeyAuth(headers, 'X-API-Key', '\t\t');
      expect(result).toBe(false);
      expect(headers['X-API-Key']).toBeUndefined();
    });
  });

  describe('applyCustomHeaders', () => {
    it('should set multiple custom headers', () => {
      const headers: Record<string, string> = {};
      const result = applyCustomHeaders(headers, {
        'X-Custom-1': 'value1',
        'X-Custom-2': 'value2',
      });
      expect(result).toBe(true);
      expect(headers['X-Custom-1']).toBe('value1');
      expect(headers['X-Custom-2']).toBe('value2');
    });

    it('should skip unresolvable env refs', () => {
      const headers: Record<string, string> = {};
      const result = applyCustomHeaders(headers, {
        'X-Good': 'value',
        'X-Bad': { $env: 'NONEXISTENT_12345' },
      });
      expect(result).toBe(true);
      expect(headers['X-Good']).toBe('value');
      expect(headers['X-Bad']).toBeUndefined();
    });

    it('should return false when all headers are unresolvable', () => {
      const headers: Record<string, string> = {};
      const result = applyCustomHeaders(headers, {
        'X-Bad-1': { $env: 'NONEXISTENT_1' },
        'X-Bad-2': { $env: 'NONEXISTENT_2' },
      });
      expect(result).toBe(false);
      expect(Object.keys(headers).length).toBe(0);
    });

    it('should return false for empty headers object', () => {
      const headers: Record<string, string> = {};
      const result = applyCustomHeaders(headers, {});
      expect(result).toBe(false);
    });

    it('should reject whitespace-only header values', () => {
      const headers: Record<string, string> = {};
      const result = applyCustomHeaders(headers, {
        'X-Good': 'value',
        'X-Whitespace': '   ',
      });
      expect(result).toBe(true);
      expect(headers['X-Good']).toBe('value');
      expect(headers['X-Whitespace']).toBeUndefined();
    });

    it('should override existing Authorization header', () => {
      const headers: Record<string, string> = { Authorization: 'Bearer old-token' };
      const result = applyCustomHeaders(headers, {
        Authorization: 'Bearer new-token',
      });
      expect(result).toBe(true);
      expect(headers['Authorization']).toBe('Bearer new-token');
    });
  });

  describe('applyStaticAuth', () => {
    it('should route bearer type', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, { type: 'bearer', token: 'tok' });
      expect(result).toBe(true);
      expect(headers['Authorization']).toBe('Bearer tok');
    });

    it('should route basic type', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, { type: 'basic', username: 'u', password: 'p' });
      expect(result).toBe(true);
      expect(headers['Authorization']).toContain('Basic');
    });

    it('should route api-key type', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, { type: 'api-key', header: 'X-Key', key: 'k' });
      expect(result).toBe(true);
      expect(headers['X-Key']).toBe('k');
    });

    it('should route custom-headers type', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, {
        type: 'custom-headers',
        headers: { 'X-Custom': 'value' },
      });
      expect(result).toBe(true);
      expect(headers['X-Custom']).toBe('value');
    });

    it('should return true for none type', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, { type: 'none' });
      expect(result).toBe(true);
    });

    it('should return false for missing credentials', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, { type: 'bearer' }); // No token
      expect(result).toBe(false);
    });

    it('should return false for unknown auth type', () => {
      const headers: Record<string, string> = {};
      const result = applyStaticAuth(headers, { type: 'oauth2' as any });
      expect(result).toBe(false);
    });
  });
});
