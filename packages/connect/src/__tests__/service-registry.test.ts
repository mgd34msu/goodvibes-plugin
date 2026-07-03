/**
 * Ported from v1 precision-engine `__tests__/utils/service-registry.test.ts`
 * (assertions intact). v2 persistence is `.goodvibes/services.json` via
 * `registry-store`; the registry reads fresh on every call, so a plain static
 * import + cwd mock replaces the v1 resetModules dance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as registry from '../fetch/service-registry.js';

describe('service-registry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'service-registry-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getFetchServices', () => {
    it('should return empty object when no services configured', () => {
      expect(registry.getFetchServices()).toEqual({});
    });
  });

  describe('getService', () => {
    it('should return undefined for unknown service', () => {
      expect(registry.getService('nonexistent')).toBeUndefined();
    });
  });

  describe('addService', () => {
    it('should add a new service', async () => {
      await registry.addService('github', {
        base_url: 'https://api.github.com',
        auth_type: 'bearer',
        description: 'GitHub API',
      });
      const svc = registry.getService('github');
      expect(svc).toBeDefined();
      expect(svc!.base_url).toBe('https://api.github.com');
      expect(svc!.auth_type).toBe('bearer');
    });

    it('should throw on collision without force', async () => {
      await registry.addService('test', { base_url: 'https://example.com' });
      await expect(registry.addService('test', { base_url: 'https://other.com' })).rejects.toThrow(
        'already exists',
      );
    });

    it('should allow overwrite with force', async () => {
      await registry.addService('test', { base_url: 'https://example.com' });
      await registry.addService('test', { base_url: 'https://updated.com' }, true);
      expect(registry.getService('test')!.base_url).toBe('https://updated.com');
    });
  });

  describe('removeService', () => {
    it('should return false for unknown service', async () => {
      expect(await registry.removeService('nonexistent')).toBe(false);
    });

    it('should remove existing service', async () => {
      await registry.addService('temp', { base_url: 'https://temp.com' });
      expect(await registry.removeService('temp')).toBe(true);
      expect(registry.getService('temp')).toBeUndefined();
    });

    it('should also remove related URL patterns', async () => {
      await registry.addService('myapi', { base_url: 'https://api.example.com' });
      await registry.addUrlPattern('api.example.com', 'myapi');
      expect(registry.matchServiceByUrl('https://api.example.com/test')).toBe('myapi');

      await registry.removeService('myapi');
      expect(registry.matchServiceByUrl('https://api.example.com/test')).toBeUndefined();
    });
  });

  describe('URL patterns', () => {
    it('should match URL to service by hostname', async () => {
      await registry.addService('gh', { base_url: 'https://api.github.com' });
      await registry.addUrlPattern('api.github.com', 'gh');
      expect(registry.matchServiceByUrl('https://api.github.com/repos')).toBe('gh');
      expect(registry.matchServiceByUrl('https://api.github.com/users/test')).toBe('gh');
    });

    it('should return undefined for unmatched URL', () => {
      expect(registry.matchServiceByUrl('https://unknown.com')).toBeUndefined();
    });

    it('should return undefined for invalid URL', () => {
      expect(registry.matchServiceByUrl('not-a-url')).toBeUndefined();
    });

    it('should throw when adding pattern for nonexistent service', async () => {
      await expect(registry.addUrlPattern('api.example.com', 'nonexistent')).rejects.toThrow('not found');
    });

    it('should replace existing pattern for same hostname', async () => {
      await registry.addService('svc1', { base_url: 'https://api.example.com' });
      await registry.addService('svc2', { base_url: 'https://api.example.com' }, true);
      await registry.addUrlPattern('api.example.com', 'svc1');
      await registry.addUrlPattern('api.example.com', 'svc2');
      expect(registry.matchServiceByUrl('https://api.example.com/test')).toBe('svc2');
    });
  });

  describe('global defaults', () => {
    it('should return undefined when no defaults set', () => {
      expect(registry.getFetchGlobalDefaults()).toBeUndefined();
    });

    it('should set and retrieve global defaults', async () => {
      await registry.setFetchGlobalDefaults({
        headers: { 'User-Agent': 'Connect/1.0' },
        timeout_ms: 5000,
      });
      const defaults = registry.getFetchGlobalDefaults();
      expect(defaults?.headers?.['User-Agent']).toBe('Connect/1.0');
      expect(defaults?.timeout_ms).toBe(5000);
    });
  });

  describe('listServiceNames', () => {
    it('should return empty array when no services', () => {
      expect(registry.listServiceNames()).toEqual([]);
    });

    it('should list all service names', async () => {
      await registry.addService('a', { base_url: 'https://a.com' });
      await registry.addService('b', { base_url: 'https://b.com' });
      const names = registry.listServiceNames();
      expect(names).toContain('a');
      expect(names).toContain('b');
    });
  });

  describe('getServiceSummary / getAllServiceSummaries', () => {
    it('should return undefined for unknown service', () => {
      expect(registry.getServiceSummary('nope')).toBeUndefined();
    });

    it('should return safe summary without secrets', async () => {
      await registry.addService('api', {
        base_url: 'https://api.com',
        auth_type: 'bearer',
        description: 'Test API',
        default_headers: { 'X-Custom': 'value' },
      });
      const summary = registry.getServiceSummary('api');
      expect(summary).toEqual({
        name: 'api',
        base_url: 'https://api.com',
        auth_type: 'bearer',
        description: 'Test API',
      });
      expect((summary as unknown as { default_headers?: unknown }).default_headers).toBeUndefined();
    });

    it('should return all summaries', async () => {
      await registry.addService('x', { base_url: 'https://x.com' });
      await registry.addService('y', { base_url: 'https://y.com' });
      const summaries = registry.getAllServiceSummaries();
      expect(summaries).toHaveLength(2);
      expect(summaries.map((s) => s.name)).toContain('x');
      expect(summaries.map((s) => s.name)).toContain('y');
    });
  });
});
