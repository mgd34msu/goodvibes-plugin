/**
 * Search index construction and query for registry-engine core layer (L1).
 * Provides Fuse.js-based fuzzy search over registry entries.
 */

import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import type { RegistryEntry, SearchResult, Registry } from './types.js';

/**
 * Fuse.js configuration for fuzzy searching registry entries.
 * Weighted search across name, description, and keywords fields.
 */
export const SEARCH_OPTIONS: IFuseOptions<RegistryEntry> = {
  keys: [
    { name: 'name', weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords', weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
};

/**
 * Create a Fuse.js search index from a registry.
 * @param registry - The registry to index
 * @returns A Fuse index, or null if registry is empty/null
 */
export function buildIndex(registry: Registry | null): Fuse<RegistryEntry> | null {
  if (!registry || !registry.search_index) return null;
  return new Fuse(registry.search_index, SEARCH_OPTIONS);
}

/**
 * Perform a fuzzy search and return formatted results.
 * @param index - The Fuse.js index to search
 * @param queryStr - The query string
 * @param limit - Maximum number of results to return (default: 5)
 * @returns Array of SearchResult objects with relevance scores
 */
export function query(
  index: Fuse<RegistryEntry> | null,
  queryStr: string,
  limit: number = 5
): SearchResult[] {
  if (!index) return [];

  const results = index.search(queryStr, { limit });
  return results.map((r) => ({
    name: r.item.name,
    path: r.item.path,
    description: r.item.description,
    relevance: Math.round((1 - (r.score || 0)) * 100) / 100,
  }));
}

/**
 * Find a single entry by name, returning the best match or null.
 *
 * @param index - The Fuse.js index to search
 * @param name - The name to search for
 * @returns The best matching SearchResult, or null if not found
 */
export function findOne(
  index: Fuse<RegistryEntry> | null,
  name: string
): SearchResult | null {
  return query(index, name, 1)[0] || null;
}
