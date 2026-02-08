/**
 * SearchCache - Cache recent grep query results for incremental refinement.
 * Enables agents to narrow searches within previous results without re-running expensive operations.
 */

/**
 * Cache entry for a single search query result.
 */
export interface SearchCacheEntry {
  queryId: string;
  pattern: string;
  files: string[]; // Just file paths, no content
  timestamp: number;
}

/**
 * Context information for refined searches.
 */
export interface RefinementContext {
  refined_from: string; // Original query ID
  original_pattern: string;
  original_files: number;
  searched_files: number;
  matches_in_refined: number;
}

/**
 * Singleton cache for storing search results.
 * Implements FIFO eviction when MAX_ENTRIES is exceeded.
 */
export class SearchCache {
  private static instance: SearchCache | null = null;
  private cache: Map<string, SearchCacheEntry> = new Map();
  private readonly MAX_ENTRIES = 20;

  private constructor() {}

  /**
   * Get the singleton instance of the cache.
   */
  public static getInstance(): SearchCache {
    if (!SearchCache.instance) {
      SearchCache.instance = new SearchCache();
    }
    return SearchCache.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  public static resetInstance(): void {
    SearchCache.instance = null;
  }

  /**
   * Store query results after execution.
   * If queryId already exists, it will be replaced.
   * If MAX_ENTRIES is exceeded, evicts the oldest entry (FIFO).
   */
  public store(queryId: string, files: string[], pattern: string): void {
    // Check if we need to evict before adding
    if (!this.cache.has(queryId) && this.cache.size >= this.MAX_ENTRIES) {
      this.evictOldest();
    }

    const entry: SearchCacheEntry = {
      queryId,
      pattern,
      files: [...files], // Defensive copy
      timestamp: Date.now(),
    };

    this.cache.set(queryId, entry);
  }

  /**
   * Get cached files for refinement.
   * Returns null if queryId not found in cache.
   */
  public getFiles(queryId: string): string[] | null {
    const entry = this.cache.get(queryId);
    if (!entry) {
      return null;
    }
    return [...entry.files]; // Return defensive copy
  }

  /**
   * Get full cache entry.
   * Returns null if queryId not found in cache.
   */
  public get(queryId: string): SearchCacheEntry | null {
    const entry = this.cache.get(queryId);
    if (!entry) {
      return null;
    }
    // Return deep copy to prevent mutation
    return {
      queryId: entry.queryId,
      pattern: entry.pattern,
      files: [...entry.files],
      timestamp: entry.timestamp,
    };
  }

  /**
   * Clear all cache entries.
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for debugging.
   */
  public stats(): {
    size: number;
    entries: Array<{ queryId: string; fileCount: number; age_seconds: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values()).map((entry) => ({
      queryId: entry.queryId,
      fileCount: entry.files.length,
      age_seconds: Math.floor((now - entry.timestamp) / 1000),
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Evict the oldest entry (FIFO eviction).
   * Called when MAX_ENTRIES is exceeded.
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [queryId, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestId = queryId;
      }
    }

    if (oldestId !== null) {
      this.cache.delete(oldestId);
    }
  }
}

// Export singleton instance for convenience
export const searchCache = SearchCache.getInstance();
