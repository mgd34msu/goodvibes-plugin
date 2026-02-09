import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateState, buildAuthorizeUrl, startOAuth2Flow } from '../../../utils/fetch/auth/oauth2-browser.js';
import type { ServiceAuth } from '../../../utils/fetch/secrets-store.js';

describe('oauth2-browser', () => {
  describe('generateState', () => {
    it('should generate a hex string', () => {
      const state = generateState();
      expect(state).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique values', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
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
      
      const url = buildAuthorizeUrl(auth, 'http://localhost:9876/callback', 'test-state');
      const parsed = new URL(url);
      
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
      
      const url = buildAuthorizeUrl(auth, 'http://localhost:9876/callback', 'state');
      const parsed = new URL(url);
      expect(parsed.searchParams.get('scope')).toBeNull();
    });

    it('should throw for missing authorize_url', () => {
      const auth: ServiceAuth = { type: 'oauth2', client_id: 'cid' };
      expect(() => buildAuthorizeUrl(auth, 'http://localhost:9876/callback', 'state')).toThrow('Missing required fields');
    });

    it('should throw for missing client_id', () => {
      const auth: ServiceAuth = { type: 'oauth2', authorize_url: 'https://auth.example.com/authorize' };
      expect(() => buildAuthorizeUrl(auth, 'http://localhost:9876/callback', 'state')).toThrow('Missing required fields');
    });
  });

  describe('startOAuth2Flow', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oauth2-browser-test-'));
      await fs.promises.mkdir(path.join(tmpDir, '.goodvibes'), { recursive: true });
      await fs.promises.writeFile(
        path.join(tmpDir, '.goodvibes', 'goodvibes.json'),
        JSON.stringify({ sandbox: false }),
        'utf-8'
      );
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it('should return error for missing required fields', async () => {
      const result = await startOAuth2Flow({
        serviceName: 'test',
        auth: { type: 'oauth2' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should return error when missing token_url', async () => {
      const result = await startOAuth2Flow({
        serviceName: 'test',
        auth: {
          type: 'oauth2',
          authorize_url: 'https://auth.example.com/authorize',
          client_id: 'cid',
          // No token_url
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    // Note: Full flow tests with actual HTTP server + browser are integration tests.
    // Unit tests verify the building blocks (generateState, buildAuthorizeUrl) and error paths.
    // The startOAuth2Flow function would require mocking http.createServer for full coverage,
    // which is tested at the integration level.
  });
});
