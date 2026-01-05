/**
 * Documentation fetching handlers
 *
 * Provides handlers for fetching library documentation from npm,
 * GitHub, and official documentation sources with caching support.
 *
 * @module handlers/docs
 */

import { ToolResponse } from '../types.js';
import { fetchUrl } from '../utils.js';
import { fetchNpmReadme } from './npm.js';

/**
 * Cache entry with TTL tracking for documentation responses
 *
 * @template T - The type of data stored in the cache
 */
interface CacheEntry<T> {
  /** The cached data */
  data: T;
  /** Unix timestamp when the data was cached */
  timestamp: number;
}

/**
 * LRU (Least Recently Used) cache implementation with max size limit
 *
 * @template K - The type of cache keys
 * @template V - The type of cache values
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  /**
   * Creates a new LRU cache with the specified maximum size.
   *
   * @param maxSize - Maximum number of entries before eviction starts
   */
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * Retrieves a value from the cache and marks it as recently used.
   *
   * @param key - The cache key to look up
   * @returns The cached value or undefined if not found
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used) by deleting and re-inserting
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * Stores a value in the cache, evicting the least recently used entry if at capacity.
   *
   * @param key - The cache key
   * @param value - The value to cache
   */
  set(key: K, value: V): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first item) when at capacity
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * Returns the current number of entries in the cache.
   *
   * @returns The cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Cache TTL in milliseconds.
 * Can be overridden via GOODVIBES_CACHE_TTL_MS environment variable.
 * Default: 15 minutes (900000ms)
 */
const CACHE_TTL_MS = parseInt(
  process.env.GOODVIBES_CACHE_TTL_MS ?? String(15 * 60 * 1000),
  10
);

/**
 * Maximum number of entries in each cache before LRU eviction
 */
const MAX_CACHE_SIZE = 100;

/** LRU cache for npm package data (max 100 entries) */
const npmCache = new LRUCache<string, CacheEntry<Awaited<ReturnType<typeof fetchNpmReadme>>>>(MAX_CACHE_SIZE);

/** LRU cache for GitHub README content (max 100 entries) */
const githubReadmeCache = new LRUCache<string, CacheEntry<string | null>>(MAX_CACHE_SIZE);

/**
 * Clears all caches. Useful for testing.
 * @internal
 */
export function clearDocsCaches(): void {
  npmCache.clear();
  githubReadmeCache.clear();
}

/**
 * Generates a cache key from library name and version.
 *
 * @param library - The library/package name
 * @param version - Optional version string (defaults to 'latest')
 * @returns A normalized cache key in format 'library@version'
 *
 * @example
 * getCacheKey('react', '18.2.0'); // Returns: 'react@18.2.0'
 * getCacheKey('lodash');          // Returns: 'lodash@latest'
 */
function getCacheKey(library: string, version?: string): string {
  return `${library.toLowerCase()}@${version || 'latest'}`;
}

/**
 * Checks if a cache entry is still valid based on TTL.
 *
 * @template T - The type of data in the cache entry
 * @param entry - The cache entry to validate, or undefined if not cached
 * @returns True if the entry exists and is within TTL, false otherwise
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Retrieves npm package data from cache or fetches and caches it.
 *
 * @param library - The npm package name to look up
 * @param version - Optional version string
 * @returns Object containing the data and whether it was a cache hit
 *
 * @example
 * const { data, cacheHit } = await getCachedNpmData('react', '18.2.0');
 * if (cacheHit) console.log('Served from cache');
 */
async function getCachedNpmData(
  library: string,
  version?: string
): Promise<{ data: Awaited<ReturnType<typeof fetchNpmReadme>>; cacheHit: boolean }> {
  const key = getCacheKey(library, version);
  const cached = npmCache.get(key);

  if (isCacheValid(cached)) {
    return { data: cached.data, cacheHit: true };
  }

  const data = await fetchNpmReadme(library);
  npmCache.set(key, { data, timestamp: Date.now() });
  return { data, cacheHit: false };
}

/**
 * Retrieves GitHub README content from cache or fetches and caches it.
 *
 * @param url - The raw GitHub URL to fetch the README from
 * @param library - The library name (used for cache key)
 * @param version - Optional version string (used for cache key)
 * @returns Object containing the README content (or null) and cache hit status
 *
 * @example
 * const { data, cacheHit } = await getCachedGithubReadme(
 *   'https://raw.githubusercontent.com/pmndrs/zustand/main/readme.md',
 *   'zustand'
 * );
 */
async function getCachedGithubReadme(
  url: string,
  library: string,
  version?: string
): Promise<{ data: string | null; cacheHit: boolean }> {
  const key = getCacheKey(library, version);
  const cached = githubReadmeCache.get(key);

  if (isCacheValid(cached)) {
    return { data: cached.data, cacheHit: true };
  }

  const data = await fetchUrl(url);
  githubReadmeCache.set(key, { data, timestamp: Date.now() });
  return { data, cacheHit: false };
}

/**
 * Arguments for the fetch_docs MCP tool
 */
export interface FetchDocsArgs {
  /** The npm package or library name to fetch docs for */
  library: string;
  /** Optional specific topic to search for within the docs */
  topic?: string;
  /** Optional version to fetch docs for (defaults to 'latest') */
  version?: string;
}

/**
 * Documentation source configuration
 */
interface DocsSource {
  /** Primary documentation URL */
  url: string;
  /** Optional raw API endpoint (e.g., GitHub raw README) */
  api?: string;
  /** Optional function to generate topic-specific search URLs */
  searchUrl?: (topic: string) => string;
  /** Source type for determining fetch strategy */
  type: 'npm' | 'github' | 'website';
}

/**
 * API reference entry for a library
 */
interface ApiReference {
  /** Name of the API (e.g., 'useState', 'useEffect') */
  name: string;
  /** Brief description of what the API does */
  description: string;
  /** Optional URL to the documentation for this API */
  url?: string;
}

/**
 * Documentation sources with API endpoints or scrapeable pages
 */
const DOCS_SOURCES: Record<string, DocsSource> = {
  'react': { url: 'https://react.dev', type: 'website', searchUrl: (t) => `https://react.dev/reference/react/${t}` },
  'next': { url: 'https://nextjs.org/docs', type: 'website', searchUrl: (t) => `https://nextjs.org/docs/${t}` },
  'nextjs': { url: 'https://nextjs.org/docs', type: 'website', searchUrl: (t) => `https://nextjs.org/docs/${t}` },
  'prisma': { url: 'https://www.prisma.io/docs', type: 'website', searchUrl: (t) => `https://www.prisma.io/docs/concepts/${t}` },
  'tailwind': { url: 'https://tailwindcss.com/docs', type: 'website', searchUrl: (t) => `https://tailwindcss.com/docs/${t}` },
  'tailwindcss': { url: 'https://tailwindcss.com/docs', type: 'website', searchUrl: (t) => `https://tailwindcss.com/docs/${t}` },
  'typescript': { url: 'https://www.typescriptlang.org/docs', type: 'website' },
  'vite': { url: 'https://vitejs.dev/guide', type: 'website' },
  'vitest': { url: 'https://vitest.dev/guide', type: 'website' },
  'zustand': { url: 'https://docs.pmnd.rs/zustand', type: 'website', api: 'https://raw.githubusercontent.com/pmndrs/zustand/main/readme.md' },
  'drizzle': { url: 'https://orm.drizzle.team/docs/overview', type: 'website' },
  'zod': { url: 'https://zod.dev', type: 'website', api: 'https://raw.githubusercontent.com/colinhacks/zod/master/README.md' },
  'trpc': { url: 'https://trpc.io/docs', type: 'website' },
  'tanstack-query': { url: 'https://tanstack.com/query/latest/docs/react/overview', type: 'website' },
  'react-query': { url: 'https://tanstack.com/query/latest/docs/react/overview', type: 'website' },
};

/**
 * Library-specific API references
 */
const LIBRARY_APIS: Record<string, ApiReference[]> = {
  'react': [
    { name: 'useState', description: 'State hook for functional components', url: 'https://react.dev/reference/react/useState' },
    { name: 'useEffect', description: 'Side effects hook', url: 'https://react.dev/reference/react/useEffect' },
    { name: 'useContext', description: 'Context consumption hook', url: 'https://react.dev/reference/react/useContext' },
    { name: 'useRef', description: 'Mutable ref object hook', url: 'https://react.dev/reference/react/useRef' },
    { name: 'useMemo', description: 'Memoization hook', url: 'https://react.dev/reference/react/useMemo' },
  ],
  'next': [
    { name: 'App Router', description: 'File-based routing in app directory', url: 'https://nextjs.org/docs/app' },
    { name: 'Server Components', description: 'React Server Components', url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components' },
    { name: 'API Routes', description: 'Backend API endpoints', url: 'https://nextjs.org/docs/app/building-your-application/routing/route-handlers' },
    { name: 'Middleware', description: 'Request/response middleware', url: 'https://nextjs.org/docs/app/building-your-application/routing/middleware' },
  ],
  'nextjs': [
    { name: 'App Router', description: 'File-based routing in app directory', url: 'https://nextjs.org/docs/app' },
    { name: 'Server Components', description: 'React Server Components', url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components' },
  ],
  'prisma': [
    { name: 'Schema', description: 'Prisma schema language', url: 'https://www.prisma.io/docs/concepts/components/prisma-schema' },
    { name: 'Client', description: 'Prisma Client API', url: 'https://www.prisma.io/docs/concepts/components/prisma-client' },
    { name: 'Migrate', description: 'Database migrations', url: 'https://www.prisma.io/docs/concepts/components/prisma-migrate' },
  ],
  'tailwind': [
    { name: 'Utility Classes', description: 'Core utility classes reference', url: 'https://tailwindcss.com/docs/utility-first' },
    { name: 'Configuration', description: 'Tailwind config options', url: 'https://tailwindcss.com/docs/configuration' },
    { name: 'Responsive Design', description: 'Responsive breakpoints', url: 'https://tailwindcss.com/docs/responsive-design' },
  ],
  'zustand': [
    { name: 'create', description: 'Create a store', url: 'https://docs.pmnd.rs/zustand/getting-started/introduction' },
    { name: 'Middleware', description: 'Store middleware (persist, devtools)', url: 'https://docs.pmnd.rs/zustand/guides/typescript' },
  ],
  'zod': [
    { name: 'z.object', description: 'Object schema validation', url: 'https://zod.dev/?id=objects' },
    { name: 'z.string', description: 'String validation', url: 'https://zod.dev/?id=strings' },
    { name: 'z.infer', description: 'Type inference from schema', url: 'https://zod.dev/?id=type-inference' },
  ],
  'drizzle': [
    { name: 'Schema', description: 'Drizzle schema definition', url: 'https://orm.drizzle.team/docs/sql-schema-declaration' },
    { name: 'Queries', description: 'Query builder API', url: 'https://orm.drizzle.team/docs/select' },
    { name: 'Migrations', description: 'Database migrations', url: 'https://orm.drizzle.team/docs/migrations' },
  ],
};

/**
 * Gets common API references for known libraries.
 *
 * Returns a list of commonly-used API references for popular libraries,
 * optionally filtered by a specific topic.
 *
 * @param library - The library name to get references for
 * @param topic - Optional topic to filter references by
 * @returns Array of API references with names, descriptions, and URLs
 *
 * @example
 * getCommonApiReferences('react', 'state');
 * // Returns: [{ name: 'useState', description: 'State hook...', url: '...' }]
 *
 * @example
 * getCommonApiReferences('prisma');
 * // Returns top 5 Prisma API references
 */
export function getCommonApiReferences(library: string, topic?: string): ApiReference[] {
  const refs: ApiReference[] = [];
  const libraryRefs = LIBRARY_APIS[library] || [];

  // Filter by topic if provided
  if (topic) {
    const topicLower = topic.toLowerCase();
    const filtered = libraryRefs.filter(r =>
      r.name.toLowerCase().includes(topicLower) ||
      r.description.toLowerCase().includes(topicLower)
    );
    if (filtered.length > 0) {
      refs.push(...filtered);
    } else {
      refs.push(...libraryRefs.slice(0, 3)); // Return top 3 if no match
    }
  } else {
    refs.push(...libraryRefs.slice(0, 5)); // Return top 5
  }

  return refs;
}

/**
 * Handles the fetch_docs MCP tool call.
 *
 * Fetches documentation for a specified library from multiple sources:
 * - npm registry (README, description, repository links)
 * - GitHub raw READMEs (for libraries with known GitHub sources)
 * - Known documentation URLs for popular libraries
 *
 * Results are cached for 15 minutes to improve performance.
 *
 * @param args - The fetch_docs tool arguments
 * @param args.library - The npm package or library name
 * @param args.topic - Optional specific topic to search for
 * @param args.version - Optional version (defaults to 'latest')
 * @returns MCP tool response with documentation content and API references
 *
 * @example
 * await handleFetchDocs({ library: 'react', topic: 'hooks' });
 * // Returns: { library: 'react', content: '...', api_reference: [...], ... }
 *
 * @example
 * await handleFetchDocs({ library: 'prisma', version: '5.0.0' });
 * // Returns Prisma 5.0.0 documentation
 */
export async function handleFetchDocs(args: FetchDocsArgs): Promise<ToolResponse> {
  const library = args.library.toLowerCase();
  const topic = args.topic?.toLowerCase();

  const source = DOCS_SOURCES[library];

  // Track cache hits for npm and github fetches
  let npmCacheHit = false;
  let githubCacheHit = false;

  const result: {
    library: string;
    version: string;
    content: string;
    api_reference: ApiReference[];
    source_url: string;
    topic?: string;
    readme?: string;
    last_updated: string;
    cache_hit: boolean;
  } = {
    library: args.library,
    version: args.version || 'latest',
    content: '',
    api_reference: [],
    source_url: source?.url || `https://www.npmjs.com/package/${args.library}`,
    last_updated: new Date().toISOString().split('T')[0],
    cache_hit: false,
  };

  if (topic) {
    result.topic = topic;
  }

  // Try to fetch npm package info for any package (with caching)
  let npmFetchError: Error | null = null;
  try {
    const { data: npmData, cacheHit } = await getCachedNpmData(args.library, args.version);
    npmCacheHit = cacheHit;
    if (npmData) {
      result.readme = npmData.readme;
      result.content = npmData.description || '';
      if (npmData.repository) {
        result.api_reference.push({
          name: 'Repository',
          description: 'Source code repository',
          url: npmData.repository,
        });
      }
      if (npmData.homepage) {
        result.api_reference.push({
          name: 'Homepage',
          description: 'Official documentation',
          url: npmData.homepage,
        });
      }
    }
  } catch (error: unknown) {
    npmFetchError = error instanceof Error ? error : new Error(String(error));
  }

  // If we have a GitHub raw API for README, fetch it (with caching)
  if (source?.api) {
    try {
      const { data: readmeContent, cacheHit } = await getCachedGithubReadme(
        source.api,
        args.library,
        args.version
      );
      githubCacheHit = cacheHit;
      if (readmeContent) {
        result.readme = readmeContent.slice(0, 10000); // Limit size
        result.content = `Documentation fetched from GitHub README. See ${source.url} for full docs.`;
      }
    } catch (error: unknown) {
      // Log error but continue - GitHub readme is optional enhancement
      const githubError = error instanceof Error ? error.message : String(error);
      result.content = result.content || `Note: Could not fetch GitHub README (${githubError}). Using npm data.`;
    }
  }

  // Set cache_hit to true if any fetch was served from cache
  result.cache_hit = npmCacheHit || githubCacheHit;

  // Add common API references based on library type
  const apiReferences = getCommonApiReferences(library, topic);
  result.api_reference.push(...apiReferences);

  // If no content was fetched, provide helpful fallback
  if (!result.content && !result.readme) {
    result.content = `Documentation for ${args.library}. Visit ${result.source_url} for full documentation.`;
    if (topic) {
      result.content += ` Search for "${topic}" in the documentation.`;
      if (source?.searchUrl) {
        result.api_reference.push({
          name: `${topic} documentation`,
          description: `Direct link to ${topic} docs`,
          url: source.searchUrl(topic),
        });
      }
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}
