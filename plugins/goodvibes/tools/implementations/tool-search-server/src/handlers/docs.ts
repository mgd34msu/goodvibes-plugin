/**
 * Documentation fetching handlers
 */

import { ToolResponse } from '../types.js';
import { fetchUrl } from '../utils.js';
import { fetchNpmReadme } from './npm.js';

/**
 * Cache entry with TTL tracking
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * In-memory cache for documentation fetches
 * TTL: 15 minutes (900000ms)
 */
const CACHE_TTL_MS = 15 * 60 * 1000;

const npmCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof fetchNpmReadme>>>>();
const githubReadmeCache = new Map<string, CacheEntry<string | null>>();

/**
 * Generate cache key from library name and version
 */
function getCacheKey(library: string, version?: string): string {
  return `${library.toLowerCase()}@${version || 'latest'}`;
}

/**
 * Check if a cache entry is still valid
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Get cached npm data or fetch and cache it
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
 * Get cached GitHub README or fetch and cache it
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

export interface FetchDocsArgs {
  library: string;
  topic?: string;
  version?: string;
}

interface DocsSource {
  url: string;
  api?: string;
  searchUrl?: (topic: string) => string;
  type: 'npm' | 'github' | 'website';
}

interface ApiReference {
  name: string;
  description: string;
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
 * Get common API references for known libraries
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
 * Handle fetch_docs tool call
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
  } catch {
    // Continue without npm data
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
    } catch {
      // Continue without GitHub readme
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
