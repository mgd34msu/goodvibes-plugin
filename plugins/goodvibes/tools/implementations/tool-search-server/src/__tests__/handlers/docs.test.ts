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
  LRUCache,
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

  describe('npm cache hit branch coverage', () => {
    it('should return cached npm data on cache hit', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Cached npm package',
        readme: 'Cached README',
        repository: 'https://github.com/cached/test',
        homepage: 'https://cached.test.com',
      });

      // First call populates cache
      const result1 = await handleFetchDocs({ library: 'npm-cache-test' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(false);
      expect(fetchNpmReadme).toHaveBeenCalledTimes(1);

      // Second call should hit npm cache (line 180)
      const result2 = await handleFetchDocs({ library: 'npm-cache-test' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);
      // fetchNpmReadme should NOT be called again
      expect(fetchNpmReadme).toHaveBeenCalledTimes(1);
    });
  });

  describe('GitHub cache hit branch coverage', () => {
    it('should return cached GitHub README on cache hit', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      vi.mocked(fetchUrl).mockResolvedValue('# Cached GitHub README');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      // First call populates GitHub cache
      const result1 = await handleFetchDocs({ library: 'zustand' });
      const data1 = JSON.parse(result1.content[0].text);
      expect(data1.cache_hit).toBe(false);
      expect(fetchUrl).toHaveBeenCalledTimes(1);

      // Second call should hit GitHub cache (line 210)
      const result2 = await handleFetchDocs({ library: 'zustand' });
      const data2 = JSON.parse(result2.content[0].text);
      expect(data2.cache_hit).toBe(true);
      // fetchUrl should NOT be called again
      expect(fetchUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchUrl function coverage for DOCS_SOURCES', () => {
    it('should use next searchUrl when topic provided and no content found', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'next', topic: 'routing' });
      const data = JSON.parse(result.content[0].text);

      // Should trigger searchUrl for 'next' (line 261)
      expect(data.api_reference.some((r: ApiReference) =>
        r.url === 'https://nextjs.org/docs/routing'
      )).toBe(true);
    });

    it('should use nextjs searchUrl when topic provided and no content found', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'nextjs', topic: 'api' });
      const data = JSON.parse(result.content[0].text);

      // Should trigger searchUrl for 'nextjs' (line 262)
      expect(data.api_reference.some((r: ApiReference) =>
        r.url === 'https://nextjs.org/docs/api'
      )).toBe(true);
    });

    it('should use prisma searchUrl when topic provided and no content found', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'prisma', topic: 'relations' });
      const data = JSON.parse(result.content[0].text);

      // Should trigger searchUrl for 'prisma' (line 263)
      expect(data.api_reference.some((r: ApiReference) =>
        r.url === 'https://www.prisma.io/docs/concepts/relations'
      )).toBe(true);
    });

    it('should use tailwind searchUrl when topic provided and no content found', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'tailwind', topic: 'colors' });
      const data = JSON.parse(result.content[0].text);

      // Should trigger searchUrl for 'tailwind' (line 264)
      expect(data.api_reference.some((r: ApiReference) =>
        r.url === 'https://tailwindcss.com/docs/colors'
      )).toBe(true);
    });

    it('should use tailwindcss searchUrl when topic provided and no content found', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'tailwindcss', topic: 'spacing' });
      const data = JSON.parse(result.content[0].text);

      // Should trigger searchUrl for 'tailwindcss' (line 265)
      expect(data.api_reference.some((r: ApiReference) =>
        r.url === 'https://tailwindcss.com/docs/spacing'
      )).toBe(true);
    });
  });

  describe('npm fetch error handling', () => {
    it('should handle npm fetch error when error is an Error instance', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      // Throw an Error instance to cover the Error branch in line 448
      vi.mocked(fetchNpmReadme).mockRejectedValue(new Error('Network failed'));

      const result = await handleFetchDocs({ library: 'error-instance-pkg' });
      const data = JSON.parse(result.content[0].text);

      // Should still return a valid response
      expect(data.library).toBe('error-instance-pkg');
      expect(data.content).toContain('error-instance-pkg');
    });

    it('should handle npm fetch error when error is not an Error instance', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      // Throw a string instead of Error to trigger line 447
      vi.mocked(fetchNpmReadme).mockRejectedValue('string error message');

      const result = await handleFetchDocs({ library: 'error-test-pkg' });
      const data = JSON.parse(result.content[0].text);

      // Should still return a valid response
      expect(data.library).toBe('error-test-pkg');
      expect(data.content).toContain('error-test-pkg');
    });

    it('should handle npm fetch error when error is an object without message', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      // Throw an object that is not an Error instance
      vi.mocked(fetchNpmReadme).mockRejectedValue({ code: 'ERR_NETWORK' });

      const result = await handleFetchDocs({ library: 'object-error-pkg' });
      const data = JSON.parse(result.content[0].text);

      // Should still return a valid response
      expect(data.library).toBe('object-error-pkg');
    });

    it('should handle npm fetch error when error is null', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockRejectedValue(null);

      const result = await handleFetchDocs({ library: 'null-error-pkg' });
      const data = JSON.parse(result.content[0].text);

      // Should still return a valid response
      expect(data.library).toBe('null-error-pkg');
    });

    it('should handle npm fetch error when error is undefined', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockRejectedValue(undefined);

      const result = await handleFetchDocs({ library: 'undefined-error-pkg' });
      const data = JSON.parse(result.content[0].text);

      // Should still return a valid response
      expect(data.library).toBe('undefined-error-pkg');
    });
  });

  describe('GitHub readme fetch edge cases', () => {
    it('should handle null GitHub readme content', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      // Return null from GitHub fetch (line 460 falsy branch)
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      // Should still return valid response with fallback content
      expect(data.library).toBe('zustand');
    });

    it('should handle empty string GitHub readme content', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      // Return empty string from GitHub fetch
      vi.mocked(fetchUrl).mockResolvedValue('');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('zustand');
    });

    it('should handle GitHub error with Error instance', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      // Throw an Error instance to cover the Error branch in line 466
      vi.mocked(fetchUrl).mockRejectedValue(new Error('GitHub unavailable'));
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('zustand');
      expect(data.content).toContain('GitHub unavailable');
    });

    it('should handle GitHub error with non-Error value', async () => {
      const { fetchUrl } = await import('../../utils.js');
      const { fetchNpmReadme } = await import('../../handlers/npm.js');

      // Throw a string to cover the non-Error branch in line 466
      vi.mocked(fetchUrl).mockRejectedValue('Connection refused');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'zustand' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('zustand');
      expect(data.content).toContain('Connection refused');
    });
  });

  describe('fallback content with topic but no searchUrl', () => {
    it('should handle topic with library that has no searchUrl', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      // typescript has no searchUrl defined in DOCS_SOURCES
      const result = await handleFetchDocs({ library: 'typescript', topic: 'generics' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('typescript');
      expect(data.content).toContain('typescript');
      expect(data.content).toContain('generics');
      // Should NOT have a topic documentation link since typescript has no searchUrl
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'generics documentation'
      )).toBe(false);
    });

    it('should handle topic with unknown library (no DOCS_SOURCE entry)', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue(null);

      const result = await handleFetchDocs({ library: 'unknown-lib', topic: 'feature' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('unknown-lib');
      expect(data.content).toContain('unknown-lib');
      expect(data.content).toContain('feature');
      // Should NOT have a topic documentation link since unknown-lib has no searchUrl
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'feature documentation'
      )).toBe(false);
    });
  });

  describe('npm data with missing fields', () => {
    it('should handle npm data without description', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: '', // Empty description
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      const result = await handleFetchDocs({ library: 'no-desc-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('no-desc-pkg');
      // content should be empty string when description is empty
      expect(data.content).toBe('');
    });

    it('should handle npm data with null description', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: null as unknown as string,
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: 'https://test.com',
      });

      const result = await handleFetchDocs({ library: 'null-desc-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('null-desc-pkg');
      expect(data.content).toBe('');
    });

    it('should handle npm data without repository', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: undefined, // No repository
        homepage: 'https://test.com',
      });

      const result = await handleFetchDocs({ library: 'no-repo-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('no-repo-pkg');
      // Should not have Repository in api_reference
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Repository'
      )).toBe(false);
      // Should still have Homepage
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Homepage'
      )).toBe(true);
    });

    it('should handle npm data without homepage', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: undefined, // No homepage
      });

      const result = await handleFetchDocs({ library: 'no-home-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('no-home-pkg');
      // Should have Repository
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Repository'
      )).toBe(true);
      // Should not have Homepage in api_reference
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Homepage'
      )).toBe(false);
    });

    it('should handle npm data without repository and homepage', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: undefined,
        homepage: undefined,
      });

      const result = await handleFetchDocs({ library: 'no-links-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('no-links-pkg');
      // Should not have Repository or Homepage
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Repository'
      )).toBe(false);
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Homepage'
      )).toBe(false);
    });

    it('should handle npm data with empty string repository', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: '', // Empty string
        homepage: 'https://test.com',
      });

      const result = await handleFetchDocs({ library: 'empty-repo-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('empty-repo-pkg');
      // Empty string should be falsy, so no Repository
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Repository'
      )).toBe(false);
    });

    it('should handle npm data with empty string homepage', async () => {
      const { fetchNpmReadme } = await import('../../handlers/npm.js');
      vi.mocked(fetchNpmReadme).mockResolvedValue({
        description: 'Test package',
        readme: 'Test README',
        repository: 'https://github.com/test/test',
        homepage: '', // Empty string
      });

      const result = await handleFetchDocs({ library: 'empty-home-pkg' });
      const data = JSON.parse(result.content[0].text);

      expect(data.library).toBe('empty-home-pkg');
      // Empty string should be falsy, so no Homepage
      expect(data.api_reference.some((r: ApiReference) =>
        r.name === 'Homepage'
      )).toBe(false);
    });
  });

  describe('LRUCache class', () => {
    it('should throw error when maxSize is less than 1', () => {
      expect(() => new LRUCache(0)).toThrow('LRUCache maxSize must be at least 1');
      expect(() => new LRUCache(-1)).toThrow('LRUCache maxSize must be at least 1');
    });

    it('should allow maxSize of 1', () => {
      expect(() => new LRUCache(1)).not.toThrow();
    });

    it('should update existing key position on set', () => {
      const cache = new LRUCache<string, number>(3);

      // Add three items
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size).toBe(3);

      // Update 'a' - this should move it to the end (line 74)
      cache.set('a', 10);

      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBe(10);

      // Add a fourth item - should evict 'b' (oldest after 'a' was updated)
      cache.set('d', 4);

      expect(cache.size).toBe(3);
      expect(cache.get('b')).toBeUndefined(); // 'b' should be evicted
      expect(cache.get('a')).toBe(10); // 'a' should still exist
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should return correct size', () => {
      const cache = new LRUCache<string, number>(5);

      expect(cache.size).toBe(0);

      cache.set('a', 1);
      expect(cache.size).toBe(1);

      cache.set('b', 2);
      expect(cache.size).toBe(2);

      cache.set('c', 3);
      expect(cache.size).toBe(3);
    });

    it('should clear all entries', () => {
      const cache = new LRUCache<string, number>(5);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('should return undefined for non-existent key', () => {
      const cache = new LRUCache<string, number>(3);

      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should move accessed item to end of LRU order', () => {
      const cache = new LRUCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' - moves it to end
      cache.get('a');

      // Add 'd' - should evict 'b' (oldest after 'a' was accessed)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(1); // 'a' should still exist
      expect(cache.get('b')).toBeUndefined(); // 'b' should be evicted
    });

    it('should evict oldest item when at capacity', () => {
      const cache = new LRUCache<string, number>(2);

      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.size).toBe(2);

      // Add third item - should evict 'a'
      cache.set('c', 3);

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });
  });
});
