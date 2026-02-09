import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('service-resolver', () => {
  let tmpDir: string;
  let resolver: typeof import('../../utils/fetch/service-resolver.js');
  let registry: typeof import('../../utils/fetch/service-registry.js');
  let store: typeof import('../../utils/fetch/secrets-store.js');

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'service-resolver-test-'));
    await fs.promises.mkdir(path.join(tmpDir, '.goodvibes'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tmpDir, '.goodvibes', 'goodvibes.json'),
      JSON.stringify({ sandbox: false }),
      'utf-8'
    );

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
    
    resolver = await import('../../utils/fetch/service-resolver.js');
    registry = await import('../../utils/fetch/service-registry.js');
    store = await import('../../utils/fetch/secrets-store.js');
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
      await registry.addService('github', {
        base_url: 'https://api.github.com',
        auth_type: 'bearer',
      });
      await store.setServiceSecret('github', {
        type: 'bearer',
        token: 'ghp_abc123',
      });

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
      // Request headers should win on conflicts
      expect(headers['X-Shared']).toBe('request');
    });

    it('should work with undefined service', () => {
      const headers = resolver.buildServiceHeaders(undefined, { 'X-Custom': 'val' });
      expect(headers['X-Custom']).toBe('val');
    });
  });

  describe('resolveBaseUrl', () => {
    it('should return absolute URLs unchanged', async () => {
      const url = resolver.resolveBaseUrl(undefined, 'https://example.com/path');
      expect(url).toBe('https://example.com/path');
    });

    it('should resolve relative paths against service base_url', async () => {
      await registry.addService('api', { base_url: 'https://api.example.com/v2' });
      const resolved = await resolver.resolveService('api');
      const url = resolver.resolveBaseUrl(resolved, '/users/123');
      expect(url).toBe('https://api.example.com/v2/users/123');
    });

    it('should handle trailing slashes in base_url', async () => {
      await registry.addService('api2', { base_url: 'https://api.example.com/v2/' });
      const resolved = await resolver.resolveService('api2');
      const url = resolver.resolveBaseUrl(resolved, '/users');
      expect(url).toBe('https://api.example.com/v2/users');
    });

    it('should throw for relative URL without service', () => {
      expect(() => resolver.resolveBaseUrl(undefined, '/relative/path')).toThrow('Cannot resolve relative URL');
    });
  });
});
