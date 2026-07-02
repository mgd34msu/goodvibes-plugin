/**
 * Ported from v1 precision-engine `__tests__/utils/auth/oauth2-browser.test.ts`
 * (import paths; the v2 flow validates fields the same way, so the goodvibes.json
 * seed is unnecessary).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateState, buildAuthorizeUrl, startOAuth2Flow, escapeHtml } from '../../fetch/auth/oauth2-browser.js';
import { resolveSecretValue, type ServiceAuth } from '../../fetch/secrets-store.js';

describe('oauth2-browser', () => {
  describe('generateState', () => {
    it('should generate a hex string', () => {
      expect(generateState()).toMatch(/^[0-9a-f]{64}$/);
    });
    it('should generate unique values', () => {
      expect(generateState()).not.toBe(generateState());
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('should construct valid authorize URL', () => {
      const auth: ServiceAuth = {
        type: 'oauth2',
        authorize_url: 'https://auth.example.com/authorize',
        client_id: 'my-client-id',
        scopes: ['read', 'write'],
      };
      const parsed = new URL(buildAuthorizeUrl(auth, 'http://localhost:9876/callback', 'test-state'));
      expect(parsed.origin).toBe('https://auth.example.com');
      expect(parsed.pathname).toBe('/authorize');
      expect(parsed.searchParams.get('client_id')).toBe('my-client-id');
      expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:9876/callback');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('state')).toBe('test-state');
      expect(parsed.searchParams.get('scope')).toBe('read write');
    });

    it('should work without scopes', () => {
      const auth: ServiceAuth = {
        type: 'oauth2',
        authorize_url: 'https://auth.example.com/authorize',
        client_id: 'cid',
      };
      const parsed = new URL(buildAuthorizeUrl(auth, 'http://localhost:9876/callback', 'state'));
      expect(parsed.searchParams.get('scope')).toBeNull();
    });

    it('should throw for missing authorize_url', () => {
      expect(() => buildAuthorizeUrl({ type: 'oauth2', client_id: 'cid' }, 'http://localhost:9876/callback', 'state')).toThrow(
        'Missing required fields',
      );
    });

    it('should throw for missing client_id', () => {
      expect(() =>
        buildAuthorizeUrl(
          { type: 'oauth2', authorize_url: 'https://auth.example.com/authorize' },
          'http://localhost:9876/callback',
          'state',
        ),
      ).toThrow('Missing required fields');
    });
  });

  describe('resolveSecretValue usage', () => {
    it('should use resolveSecretValue for EnvRef client_id', () => {
      process.env.MY_CLIENT_ID = 'test-client-123';
      const parsed = new URL(
        buildAuthorizeUrl(
          { type: 'oauth2', authorize_url: 'https://auth.example.com/authorize', client_id: { $env: 'MY_CLIENT_ID' } },
          'http://localhost:9876/callback',
          'state',
        ),
      );
      expect(parsed.searchParams.get('client_id')).toBe('test-client-123');
      delete process.env.MY_CLIENT_ID;
    });

    it('should handle undefined EnvRef gracefully', () => {
      const parsed = new URL(
        buildAuthorizeUrl(
          {
            type: 'oauth2',
            authorize_url: 'https://auth.example.com/authorize',
            client_id: { $env: 'NONEXISTENT_CLIENT_ID' },
          },
          'http://localhost:9876/callback',
          'state',
        ),
      );
      expect(parsed.searchParams.get('client_id')).toBe('');
    });

    it('should resolve environment variables for client_id and client_secret', () => {
      process.env.TEST_CLIENT_ID = 'env-client-123';
      process.env.TEST_CLIENT_SECRET = 'env-secret-456';
      expect(resolveSecretValue({ $env: 'TEST_CLIENT_ID' })).toBe('env-client-123');
      expect(resolveSecretValue({ $env: 'TEST_CLIENT_SECRET' })).toBe('env-secret-456');
      delete process.env.TEST_CLIENT_ID;
      delete process.env.TEST_CLIENT_SECRET;
    });

    it('should return string values unchanged', () => {
      expect(resolveSecretValue('literal-value')).toBe('literal-value');
    });

    it('should return undefined for undefined input', () => {
      expect(resolveSecretValue(undefined)).toBeUndefined();
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });
    it('should escape less-than signs', () => {
      expect(escapeHtml('1 < 2')).toBe('1 &lt; 2');
    });
    it('should escape greater-than signs', () => {
      expect(escapeHtml('2 > 1')).toBe('2 &gt; 1');
    });
    it('should escape double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });
    it('should escape single quotes', () => {
      expect(escapeHtml("it's working")).toBe('it&#39;s working');
    });
    it('should escape all special characters in combination', () => {
      expect(escapeHtml('<script>alert("XSS & \'attack\'")</script>')).toBe(
        '&lt;script&gt;alert(&quot;XSS &amp; &#39;attack&#39;&quot;)&lt;/script&gt;',
      );
    });
  });

  describe('startOAuth2Flow', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oauth2-browser-test-'));
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it('should return error for missing required fields', async () => {
      const result = await startOAuth2Flow({ serviceName: 'test', auth: { type: 'oauth2' } });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should return error when missing token_url', async () => {
      const result = await startOAuth2Flow({
        serviceName: 'test',
        auth: { type: 'oauth2', authorize_url: 'https://auth.example.com/authorize', client_id: 'cid' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('error handling', () => {
    it('should catch errors gracefully and return them', async () => {
      const result = await startOAuth2Flow({ serviceName: 'test', auth: { type: 'oauth2' } });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
