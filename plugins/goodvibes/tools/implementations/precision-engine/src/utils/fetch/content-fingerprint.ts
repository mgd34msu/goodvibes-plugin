/**
 * Content fingerprinting and diff-aware caching for fetch operations.
 * Tracks content changes via hashing and provides cache hit/miss logic with diffs.
 */

import { createHash } from 'crypto';
import { createPatch } from 'diff';

/**
 * Interface for a fetch cache entry with content fingerprinting.
 */
export interface FetchCacheEntry {
  /** The fetched URL */
  url: string;
  /** SHA-256 hash of the extracted content */
  contentHash: string;
  /** The extracted/processed content from the response */
  extractedContent: string;
  /** Timestamp when fetched (milliseconds since epoch) */
  fetchedAt: number;
  /** Time-to-live in seconds */
  ttl: number;
  /** Detected page type (e.g., 'documentation', 'api_reference', 'json_endpoint') */
  pageType: string;
  /** HTTP response headers */
  headers: Record<string, string>;
  /** HTTP status code */
  httpStatus: number;
  /** Original content type */
  contentType?: string;
}

/**
 * Result when checking cache - indicates if content changed.
 */
export interface CacheCheckResult {
  /** Cache hit status */
  status: 'unchanged' | 'content_changed' | 'expired' | 'not_found';
  /** The cached entry if found */
  entry?: FetchCacheEntry;
  /** Time since last fetch (human readable, e.g., "8m ago") */
  cached_at?: string;
  /** Content hash of cached version */
  hash?: string;
  /** Optional hint for the user */
  hint?: string;
}

/**
 * Result when content has changed between fetches.
 */
export interface ContentChangedResult extends CacheCheckResult {
  status: 'content_changed';
  /** Unified diff between previous and current content */
  diff: string;
  /** The new content */
  content: string;
  /** Hash of the new content */
  newHash: string;
}

/**
 * Content-aware fetch cache with fingerprinting and change detection.
 * 
 * NOTE: precision-fetch.ts handler currently maintains its own inline cache (lines 33-75).
 * This module is designed to replace that inline cache during handler integration.
 * The inline cache should be removed when this module is wired in.
 */
class FetchCache {
  private cache = new Map<string, FetchCacheEntry>();
  private readonly DEFAULT_TTL_SECONDS = 900; // 15 minutes in seconds
  private readonly MAX_ENTRIES = 50;

  /**
   * Generate a cache key from URL and method.
   */
  private getCacheKey(url: string, method: string = 'GET'): string {
    return `${method.toUpperCase()}:${url}`;
  }

  /**
   * Generate SHA-256 hash of content.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Format milliseconds into human-readable time ago string.
   */
  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  /**
   * Generate unified diff between two strings.
   * Uses the 'diff' package (already a project dependency) for correct multi-hunk diffs.
   */
  private generateDiff(oldContent: string, newContent: string): string {
    return createPatch('content', oldContent, newContent, 'previous', 'current', { context: 3 });
  }

  /**
   * Store a fetch result in the cache.
   */
  set(
    url: string,
    content: string,
    options: {
      method?: string;
      ttl?: number;
      pageType?: string;
      headers?: Record<string, string>;
      httpStatus?: number;
      contentType?: string;
    } = {}
  ): void {
    const {
      method = 'GET',
      ttl = this.DEFAULT_TTL_SECONDS,
      pageType = 'unknown',
      headers = {},
      httpStatus = 200,
      contentType,
    } = options;

    const key = this.getCacheKey(url, method);
    const contentHash = this.hashContent(content);

    this.cache.set(key, {
      url,
      contentHash,
      extractedContent: content,
      fetchedAt: Date.now(),
      ttl,
      pageType,
      headers,
      httpStatus,
      contentType,
    });

    // Evict oldest entries if over limit
    if (this.cache.size > this.MAX_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.fetchedAt < oldestTime) {
          oldestTime = entry.fetchedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Check cache and compare content if found.
   * Returns cache status with diff if content changed.
   */
  check(
    url: string,
    newContent: string,
    method: string = 'GET'
  ): CacheCheckResult | ContentChangedResult {
    const key = this.getCacheKey(url, method);
    const cached = this.cache.get(key);

    if (!cached) {
      return { status: 'not_found' };
    }

    const now = Date.now();
    const age = now - cached.fetchedAt;
    const ageSeconds = Math.floor(age / 1000);

    // Check if expired
    if (ageSeconds > cached.ttl) {
      this.cache.delete(key);  // Clean up expired entry
      return {
        status: 'expired',
        entry: cached,
        cached_at: this.formatTimeAgo(age),
        hash: cached.contentHash,
        hint: 'Cache entry expired. Re-fetching.',
      };
    }

    // Compare hashes
    const newHash = this.hashContent(newContent);

    if (newHash === cached.contentHash) {
      // Content unchanged
      return {
        status: 'unchanged',
        entry: cached,
        cached_at: this.formatTimeAgo(age),
        hash: cached.contentHash,
        hint: "Content hasn't changed since last fetch. Use force: true to re-fetch.",
      };
    }

    // Content changed - generate diff
    const diff = this.generateDiff(cached.extractedContent, newContent);

    return {
      status: 'content_changed',
      entry: cached,
      diff,
      content: newContent,
      newHash,
      cached_at: this.formatTimeAgo(age),
    };
  }

  /**
   * Get cached entry if it exists and is not expired.
   */
  get(url: string, method: string = 'GET'): FetchCacheEntry | null {
    const key = this.getCacheKey(url, method);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const ageSeconds = Math.floor((now - cached.fetchedAt) / 1000);

    if (ageSeconds > cached.ttl) {
      // Expired - remove from cache
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  stats(): {
    size: number;
    entries: Array<{ url: string; age_seconds: number; pageType: string }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values()).map((entry) => ({
      url: entry.url,
      age_seconds: Math.floor((now - entry.fetchedAt) / 1000),
      pageType: entry.pageType,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

/**
 * Singleton instance of FetchCache.
 */
export const fetchCache = new FetchCache();

/**
 * Helper to detect page type from content type and URL.
 */
export function detectPageType(
  url: string,
  contentType?: string,
  content?: string
): string {
  // JSON endpoints
  if (contentType?.includes('application/json')) {
    return 'json_endpoint';
  }

  // API patterns in URL
  if (/\/api\/|\/v\d+\//i.test(url)) {
    return 'api_reference';
  }

  // Documentation patterns
  if (/\/docs?\/|documentation|readme/i.test(url)) {
    return 'documentation';
  }

  // Check content for code blocks (likely documentation or tutorial)
  if (content && (content.includes('```') || /<code|<pre/i.test(content))) {
    return 'documentation';
  }

  // Default
  return 'html_page';
}
