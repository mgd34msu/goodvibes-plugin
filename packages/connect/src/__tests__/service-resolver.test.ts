/**
 * Ported from v1 precision-engine `__tests__/utils/service-resolver.test.ts`
 * (assertions intact; import paths + v2 persistence).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as resolver from '../fetch/service-resolver.js';
import * as registry from '../fetch/service-registry.js';
import * as store from '../fetch/secrets-store.js';

describe('service-resolver', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'service-resolver-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('resolveService', () => {
    it('should return undefined for unknown service', async () => {
      expect(await resolver.resolveService('nonexistent')).toBeUndefined();
    });

    it('should resolve by service name', async () => {
      await registry.addService('github', { base_url: 'https://api.github.com', auth_type: 'bearer' });
      await store.setServiceSecret('github', { type: 'bearer', token: 'ghp_abc123' });

      const resolved = await resolver.resolveService('github');
      expect(resolved).toBeDefined();
      expect(resolved!.name).toBe('github');
      expect(resolved!.config.base_url).toBe('https://api.github.com');
      expect(resolved!.auth?.type).toBe('bearer');
      expect(resolved!.auth?.token).toBe('ghp_abc123');
      expect(resolved!.has_auth).toBe(true);
    });

    it('should resolve by URL pattern', async () => {
      await registry.addService('gh', { base_url: 'https://api.github.com' });
      await registry.addUrlPattern('api.github.com', 'gh');

      const resolved = await resolver.resolveService('https://api.github.com/repos');
      expect(resolved).toBeDefined();
      expect(resolved!.name).toBe('gh');
    });

    it('should set has_auth=false when no secrets configured', async () => {
      await registry.addService('bare', { base_url: 'https://bare.com' });
      const resolved = await resolver.resolveService('bare');
      expect(resolved!.has_auth).toBe(false);
    });
  });

  describe('buildServiceHeaders', () => {
    it('should merge headers in correct priority order', async () => {
      await registry.addService('svc', {
        base_url: 'https://api.com',
        default_headers: { 'X-Service': 'svc-value', 'X-Shared': 'service' },
      });
      await registry.setFetchGlobalDefaults({
        headers: { 'X-Global': 'global-value', 'X-Shared': 'global' },
        user_agent: 'TestAgent/1.0',
      });

      const resolved = await resolver.resolveService('svc');
      const headers = resolver.buildServiceHeaders(resolved, {
        'X-Request': 'req-value',
        'X-Shared': 'request',
      });

      expect(headers['X-Global']).toBe('global-value');
      expect(headers['X-Service']).toBe('svc-value');
      expect(headers['X-Request']).toBe('req-value');
      expect(headers['User-Agent']).toBe('TestAgent/1.0');
      expect(headers['X-Shared']).toBe('request');
    });

    it('should work with undefined service', () => {
      const headers = resolver.buildServiceHeaders(undefined, { 'X-Custom': 'val' });
      expect(headers['X-Custom']).toBe('val');
    });
  });

  describe('resolveBaseUrl', () => {
    it('should return absolute URLs unchanged', () => {
      expect(resolver.resolveBaseUrl(undefined, 'https://example.com/path')).toBe(
        'https://example.com/path',
      );
    });

    it('should resolve relative paths against service base_url', async () => {
      await registry.addService('api', { base_url: 'https://api.example.com/v2' });
      const resolved = await resolver.resolveService('api');
      expect(resolver.resolveBaseUrl(resolved, '/users/123')).toBe('https://api.example.com/v2/users/123');
    });

    it('should handle trailing slashes in base_url', async () => {
      await registry.addService('api2', { base_url: 'https://api.example.com/v2/' });
      const resolved = await resolver.resolveService('api2');
      expect(resolver.resolveBaseUrl(resolved, '/users')).toBe('https://api.example.com/v2/users');
    });

    it('should throw for relative URL without service', () => {
      expect(() => resolver.resolveBaseUrl(undefined, '/relative/path')).toThrow(
        'Cannot resolve relative URL',
      );
    });
  });
});
