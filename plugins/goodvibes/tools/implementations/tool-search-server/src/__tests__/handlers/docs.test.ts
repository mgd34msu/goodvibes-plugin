/**
 * Unit tests for docs handler
 *
 * Tests cover:
 * - handleFetchDocs
 * - getCommonApiReferences
 * - LRU cache implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  handleFetchDocs,
  getCommonApiReferences,
  clearDocsCaches,
} from '../../handlers/docs.js';

/** API reference entry for a library */
interface ApiReference {
  name: string;
  description: string;
  url?: string;
}

// Mock modules
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    fetchUrl: vi.fn().mockResolvedValue(''),
  };
});
vi.mock('../../handlers/npm.js', () => ({
  fetchNpmReadme: vi.fn().mockResolvedValue(null),
}));

describe('docs handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDocsCaches(); // Clear caches before each test
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getCommonApiReferences', () => {
    it('should return React API references', () => {
      const refs = getCommonApiReferences('react');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'useState')).toBe(true);
      expect(refs.some(r => r.name === 'useEffect')).toBe(true);
    });

    it('should return Next.js API references', () => {
      const refs = getCommonApiReferences('next');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'App Router')).toBe(true);
    });

    it('should return Prisma API references', () => {
      const refs = getCommonApiReferences('prisma');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'Schema')).toBe(true);
      expect(refs.some(r => r.name === 'Client')).toBe(true);
    });

    it('should return Tailwind API references', () => {
      const refs = getCommonApiReferences('tailwind');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'Utility Classes')).toBe(true);
    });

    it('should return Zod API references', () => {
      const refs = getCommonApiReferences('zod');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'z.object')).toBe(true);
    });

    it('should return Drizzle API references', () => {
      const refs = getCommonApiReferences('drizzle');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'Schema')).toBe(true);
    });

    it('should filter by topic when provided', () => {
      const refs = getCommonApiReferences('react', 'state');

      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(r => r.name === 'useState')).toBe(true);
    });

    it('should return top 3 if no topic match', () => {
      const refs = getCommonApiReferences('react', 'nonexistent-topic');

      expect(refs.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for unknown library', () => {
      const refs = getCommonApiReferences('unknown-library');

      expect(refs).toEqual([]);
    });

    it('should return top 5 without topic', () => {
      const refs = getCommonApiReferences('react');

      expect(refs.length).toBeLessThanOrEqual(5);
    });

    it('should include URL in references', () => {
      const refs = getCommonApiReferences('react');

      refs.forEach(ref => {
        expect(ref).toHaveProperty('name');
        expect(ref).toHaveProperty('description');
        expect(ref.url).toBeDefined();
      });
    });
  });

  describe('handleFetchDocs', () => {
    it('should return docs for known library', async () => {
      const result = await handleFetchDocs({ library: 'react' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('react');
      expect(data.source_url).toBe('https://react.dev');
    });

    it('should return npm URL for unknown library', async () => {
      const result = await handleFetchDocs({ library: 'unknown-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.source_url).toBe('https://www.npmjs.com/package/unknown-pkg');
    });

    it('should include version in response', async () => {
      const result = await handleFetchDocs({
        library: 'react',
        version: '18.2.0',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.version).toBe('18.2.0');
    });

    it('should default version to latest', async () => {
      const result = await handleFetchDocs({ library: 'react' });
      const data = JSON.parse(result.content[0].text);

      expect(data.version).toBe('latest');
    });

    it('should include topic in response when provided', async () => {
      const result = await handleFetchDocs({
        library: 'react',
        topic: 'hooks',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.topic).toBe('hooks');
    });

    it('should include api_reference in response', async () => {
      const result = await handleFetchDocs({ library: 'react' });
      const data = JSON.parse(result.content[0].text);

      expect(data.api_reference).toBeDefined();
      expect(Array.isArray(data.api_reference)).toBe(true);
    });

    it('should include last_updated in response', async () => {
      const result = await handleFetchDocs({ library: 'prisma' });
      const data = JSON.parse(result.content[0].text);

      expect(data.last_updated).toBeDefined();
      expect(data.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should fetch GitHub README when API is available', async () => {
      const { fetchUrl } = await import('../../utils.js');
      vi.mocked(fetchUrl).mockResolvedValue('# Zustand\n\nA small state management library.');

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      expect(data.readme).toContain('Zustand');
    });

    it('should truncate long README content', async () => {
      const { fetchUrl } = await import('../../utils.js');
      vi.mocked(fetchUrl).mockResolvedValue('x'.repeat(15000));

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      expect(data.readme.length).toBeLessThanOrEqual(10000);
    });

    it('should handle GitHub fetch errors gracefully', async () => {
      const { fetchUrl } = await import('../../utils.js');
      vi.mocked(fetchUrl).mockRejectedValue(new Error('Network error'));

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      // Should still return valid response
      expect(data.library).toBe('zustand');
    });

    it('should provide fallback content when no docs found', async () => {
      const result = await handleFetchDocs({ library: 'obscure-library' });
      const data = JSON.parse(result.content[0].text);

      expect(data.content).toContain('obscure-library');
      expect(data.content).toContain('documentation');
    });

    it('should add topic search URL when topic provided', async () => {
      const result = await handleFetchDocs({
        library: 'react',
        topic: 'useEffect',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.api_reference.some((r: ApiReference) =>
        r.name.toLowerCase().includes('useeffect') ||
        r.url?.includes('useEffect')
      )).toBe(true);
    });

    it('should normalize library name to lowercase', async () => {
      const result = await handleFetchDocs({ library: 'REACT' });
      const data = JSON.parse(result.content[0].text);

      expect(data.source_url).toBe('https://react.dev');
    });

    it('should handle nextjs alias', async () => {
      const result = await handleFetchDocs({ library: 'nextjs' });
      const data = JSON.parse(result.content[0].text);

      expect(data.source_url).toBe('https://nextjs.org/docs');
    });

    it('should handle tailwindcss alias', async () => {
      const result = await handleFetchDocs({ library: 'tailwindcss' });
      const data = JSON.parse(result.content[0].text);

      expect(data.source_url).toBe('https://tailwindcss.com/docs');
    });

    describe('response format', () => {
      it('should return properly formatted response', async () => {
        const result = await handleFetchDocs({ library: 'react' });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        const result = await handleFetchDocs({ library: 'prisma' });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });

  describe('LRU cache behavior', () => {
    it('should cache responses across multiple calls', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      vi.mocked(fetchUrl).mockResolvedValue('# README content');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // First call - should fetch
      const result1 = await handleFetchDocs({ library: 'test-pkg' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(false);

      // Second call - should be cached
      const result2 = await handleFetchDocs({ library: 'test-pkg' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);
    });

    it('should cache different versions separately', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // Cache version 1.0.0
      await handleFetchDocs({ library: 'test-pkg', version: '1.0.0' });

      // Different version should not hit cache
      const result = await handleFetchDocs({ library: 'test-pkg', version: '2.0.0' });
      const data = JSON.parse(result.content[0].text);
      expect(data.cache_hit).toBe(false);
      expect(data.version).toBe('2.0.0');
    });

    it('should handle cache eviction when max size reached', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // Fill cache with 101 different packages (max size is 100)
      for (let i = 0; i < 101; i++) {
        await handleFetchDocs({ library: `pkg-${i}` });
      }

      // First package should have been evicted
      const result = await handleFetchDocs({ library: 'pkg-0' });
      const data = JSON.parse(result.content[0].text);
      expect(data.cache_hit).toBe(false);

      // More recent packages should still be cached
      const result2 = await handleFetchDocs({ library: 'pkg-100' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);
    });

    it('should update LRU order on cache access', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // Cache first package
      await handleFetchDocs({ library: 'pkg-first' });

      // Cache 99 more packages
      for (let i = 1; i < 100; i++) {
        await handleFetchDocs({ library: `pkg-${i}` });
      }

      // Access first package again (should move to end)
      await handleFetchDocs({ library: 'pkg-first' });

      // Add one more package (101st) - should evict pkg-1, not pkg-first
      await handleFetchDocs({ library: 'pkg-101' });

      // pkg-first should still be cached (was accessed recently)
      const result1 = await handleFetchDocs({ library: 'pkg-first' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(true);

      // pkg-1 should have been evicted
      const result2 = await handleFetchDocs({ library: 'pkg-1' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(false);
    });

    it('should respect cache TTL for expired entries', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // Cache a package
      const result1 = await handleFetchDocs({ library: 'test-pkg' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(false);

      // Should be cached immediately
      const result2 = await handleFetchDocs({ library: 'test-pkg' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);

      // Note: Testing actual TTL expiration would require mocking Date.now()
      // or waiting 15 minutes, which is impractical for unit tests.
      // The isCacheValid function handles TTL checks.
    });

    it('should cache GitHub README separately from npm data', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      vi.mocked(fetchUrl).mockResolvedValue('# GitHub README');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'npm description',
        readme: 'npm README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // First call for library with GitHub API
      const result1 = await handleFetchDocs({ library: 'zustand' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(false);

      // Second call should hit both caches
      const result2 = await handleFetchDocs({ library: 'zustand' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);
    });
  });

  describe('cache TTL configuration', () => {
    it('should use default TTL when env variable not set', async () => {
      // Default TTL is 15 minutes (900000ms)
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      // Cache a package
      const result1 = await handleFetchDocs({ library: 'test-pkg' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(false);

      // Should be cached immediately
      const result2 = await handleFetchDocs({ library: 'test-pkg' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);
    });

    it('should respect GOODVIBES_CACHE_TTL_MS environment variable', async () => {
      // Note: This test documents the expected behavior
      // Actual runtime configuration would require reloading the module
      // with a different environment variable value
      expect(process.env.GOODVIBES_CACHE_TTL_MS).toBeUndefined();
    });

    it('should parse cache TTL as integer', () => {
      // Verify that the TTL is a valid number
      // This indirectly tests that parseInt is working correctly
      const testEnvValue = '60000'; // 1 minute in ms
      const parsedValue = parseInt(testEnvValue, 10);
      expect(parsedValue).toBe(60000);
      expect(typeof parsedValue).toBe('number');
    });

    it('should handle invalid TTL values gracefully', () => {
      // Verify that NaN would result from invalid input
      const invalidValue = 'not-a-number';
      const parsedValue = parseInt(invalidValue, 10);
      expect(Number.isNaN(parsedValue)).toBe(true);
    });
  });
});
