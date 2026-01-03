/**
 * Unit tests for docs handler
 *
 * Tests cover:
 * - handleFetchDocs
 * - getCommonApiReferences
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  handleFetchDocs,
  getCommonApiReferences,
} from '../../handlers/docs.js';

// Mock modules
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    fetchUrl: vi.fn().mockResolvedValue(''),
  };
});
vi.mock('./npm.js', () => ({
  fetchNpmReadme: vi.fn().mockResolvedValue(null),
}));

describe('docs handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      expect(data.api_reference.some((r: any) =>
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
});
