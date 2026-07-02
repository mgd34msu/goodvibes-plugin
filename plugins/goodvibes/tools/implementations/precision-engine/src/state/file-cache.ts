/**
 * FileStateCache - Session-scoped file state tracking for precision_read/precision_edit.
 * Implements optimistic concurrency control (OCC), diff generation, and LRU memory management.
 */

import { createHash } from 'crypto';
import { createPatch } from 'diff';
import { getConfigValue } from '../runtime-config.js';

/**
 * Modification log entry for a file version.
 */
export interface ModEntry {
  version: number;
  agentId?: string;
  tool: string; // "precision_edit" | "precision_write" | "external"
  timestamp: number;
  summary?: string;
}

/**
 * Cache entry for a single file.
 */
export interface CacheEntry {
  contentHash: string; // sha256 of file content
  content: string; // stored content for diff generation
  contentBytes: number; // tracked for memory budget
  lineCount: number;
  byteSize: number;
  firstReadAt: number; // timestamp of first read
  lastReadAt: number; // timestamp of most recent read
  lastExtract: string; // extraction mode used
  offset?: number; // if partial read
  limit?: number; // if partial read
  readCount: number; // total reads this session
  tokenCost: number; // estimated tokens per full read
  tokensSaved: number; // legacy accumulator — self-crediting removed in v2 rebuild (stays 0)
  version: number; // OCC version counter
  lastModifiedBy?: string; // agent ID or tool name
  lastModifiedAt?: number;
  modificationLog: ModEntry[]; // bounded to last 10
}

/**
 * Result of a cache lookup operation.
 */
export interface CacheLookupResult {
  status: 'miss' | 'unchanged' | 'modified';
  entry: CacheEntry;
  // For 'unchanged' | 'modified': timestamp of the previous read (before this lookup)
  previousReadAt?: number;
  // For 'modified':
  diff?: string;
  changes?: {
    added: number;
    removed: number;
    modifiedRanges: string[];
  };
  modifiedBy?: string;
  previousLineCount?: number;
}

/**
 * Conflict information when an update fails due to version mismatch.
 */
export interface ConflictInfo {
  yourVersion: number;
  currentVersion: number;
  modifiedBy?: string;
  modifiedAt?: number;
  modificationsSinceRead: ModEntry[];
  diffSinceRead?: string;
}

/**
 * Result of a cache update operation.
 */
export interface CacheUpdateResult {
  status: 'updated' | 'conflict';
  version: number;
  // For 'conflict':
  conflictInfo?: ConflictInfo;
}

/**
 * Result of a conflict check operation.
 */
export interface ConflictCheckResult {
  hasConflict: boolean;
  yourVersion: number;
  currentVersion: number;
  modifiedBy?: string;
  modificationsSinceRead: ModEntry[];
}

/**
 * Session statistics for cache analytics.
 */
export interface SessionStats {
  uniqueFilesRead: number;
  totalReads: number;
  cacheHits: number;
  cacheHitRate: string;
  tokensSaved: number;
  memoryUsedMb: number;
  memoryBudgetMb: number;
  conflictsDetected: number;
  mostReadFiles: { path: string; reads: number; tokensSaved: number }[];
  mostModifiedFiles: { path: string; modifications: number }[];
}

/**
 * Singleton cache for tracking file state across the session.
 */
export class FileStateCache {
  private static instance: FileStateCache | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private totalContentBytes = 0;
  private conflictsDetected = 0;

  private get cacheMode(): 'hash_only' | 'with_content' {
    return (getConfigValue<string>('cache_mode') as 'hash_only' | 'with_content') || 'with_content';
  }

  private get maxMemoryBytes(): number {
    const mb = getConfigValue<number>('cache_max_mb');
    return (typeof mb === 'number' && mb > 0 ? mb : 200) * 1024 * 1024;
  }

  private constructor() {
    // Config values now read dynamically via getters
  }

  /**
   * Get the singleton instance of the cache.
   */
  public static getInstance(): FileStateCache {
    if (!FileStateCache.instance) {
      FileStateCache.instance = new FileStateCache();
    }
    return FileStateCache.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  public static resetInstance(): void {
    FileStateCache.instance = null;
  }

  /**
   * Compute sha256 hash of content.
   */
  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Estimate token count from content length.
   * Uses the same approximation as logging.ts: ~4 characters per token.
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Parse diff hunks to extract modified line ranges.
   */
  private extractModifiedRanges(diff: string): string[] {
    const ranges: string[] = [];
    const hunkPattern = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
    let match: RegExpExecArray | null;

    while ((match = hunkPattern.exec(diff)) !== null) {
      const startLine = parseInt(match[3], 10);
      const lineCount = match[4] ? parseInt(match[4], 10) : 1;
      const endLine = startLine + lineCount - 1;

      if (lineCount === 1) {
        ranges.push(String(startLine));
      } else {
        ranges.push(`${startLine}-${endLine}`);
      }
    }

    return ranges;
  }

  /**
   * Count added and removed lines from diff.
   */
  private countDiffChanges(diff: string): { added: number; removed: number } {
    const lines = diff.split('\n');
    let added = 0;
    let removed = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        added++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removed++;
      }
    }

    return { added, removed };
  }

  /**
   * Generate unified diff between old and new content.
   */
  private generateDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): string {
    return createPatch(filePath, oldContent, newContent, '', '', {
      context: 3,
    });
  }

  /**
   * Track memory usage after adding/updating an entry.
   */
  private trackMemory(entry: CacheEntry, oldBytes?: number): void {
    if (oldBytes !== undefined) {
      this.totalContentBytes -= oldBytes;
    }
    this.totalContentBytes += entry.contentBytes;

    // Evict LRU entries if over budget, but always keep at least the most recent entry
    while (this.totalContentBytes > this.maxMemoryBytes && this.cache.size > 1) {
      this.evictLRU();
    }
  }

  /**
   * Evict the least recently used (LRU) cache entry.
   */
  private evictLRU(): void {
    let oldestPath: string | null = null;
    let oldestTime = Infinity;

    for (const [path, entry] of this.cache.entries()) {
      if (entry.lastReadAt < oldestTime) {
        oldestTime = entry.lastReadAt;
        oldestPath = path;
      }
    }

    if (oldestPath) {
      const evictedEntry = this.cache.get(oldestPath);
      if (evictedEntry) {
        this.totalContentBytes -= evictedEntry.contentBytes;
        this.cache.delete(oldestPath);
      }
    }
  }

  /**
   * Lookup file in cache and determine if content has changed.
   * Returns cache hit status, diff if modified, and tokens saved if unchanged.
   */
  public lookup(
    filePath: string,
    content: string,
    extract: string,
    offset?: number,
    limit?: number
  ): CacheLookupResult {
    const contentHash = this.computeHash(content);
    const existing = this.cache.get(filePath);
    const now = Date.now();

    // Cache miss - first time reading this file
    if (!existing) {
      const lines = content.split('\n');
      const tokenCost = this.estimateTokens(content);
      const contentBytes = Buffer.byteLength(content, 'utf8');

      const newEntry: CacheEntry = {
        contentHash,
        content: this.cacheMode === 'with_content' ? content : '',
        contentBytes: this.cacheMode === 'with_content' ? contentBytes : 0,
        lineCount: lines.length,
        byteSize: contentBytes,
        firstReadAt: now,
        lastReadAt: now,
        lastExtract: extract,
        offset,
        limit,
        readCount: 1,
        tokenCost,
        tokensSaved: 0,
        version: 1,
        modificationLog: [],
      };

      this.cache.set(filePath, newEntry);
      if (this.cacheMode === 'with_content') {
        this.trackMemory(newEntry);
      }

      return {
        status: 'miss',
        entry: newEntry,
      };
    }

    // Update read tracking
    const oldBytes = existing.contentBytes;
    const previousReadAt = existing.lastReadAt;
    existing.lastReadAt = now;
    existing.readCount++;
    existing.lastExtract = extract;
    existing.offset = offset;
    existing.limit = limit;

    // Content unchanged - cache hit. No token self-crediting: the handler
    // always delivers the requested content; the cache only adds freshness.
    if (contentHash === existing.contentHash) {
      return {
        status: 'unchanged',
        entry: existing,
        previousReadAt,
      };
    }

    // Content modified - generate diff
    let diff: string | undefined;
    let changes:
      | { added: number; removed: number; modifiedRanges: string[] }
      | undefined;

    // Capture previous line count BEFORE mutation
    const previousLineCount = existing.lineCount;

    if (this.cacheMode === 'with_content' && existing.content) {
      diff = this.generateDiff(filePath, existing.content, content);
      const counts = this.countDiffChanges(diff);
      const ranges = this.extractModifiedRanges(diff);

      changes = {
        added: counts.added,
        removed: counts.removed,
        modifiedRanges: ranges,
      };
    }

    // Update cache entry with new content
    const contentBytes = Buffer.byteLength(content, 'utf8');
    existing.contentHash = contentHash;
    existing.content = this.cacheMode === 'with_content' ? content : '';
    existing.contentBytes = this.cacheMode === 'with_content' ? contentBytes : 0;
    existing.lineCount = content.split('\n').length;
    existing.byteSize = contentBytes;
    existing.tokenCost = this.estimateTokens(content);

    if (this.cacheMode === 'with_content') {
      this.trackMemory(existing, oldBytes);
    }

    return {
      status: 'modified',
      entry: existing,
      previousReadAt,
      diff,
      changes,
      modifiedBy: existing.lastModifiedBy,
      previousLineCount,
    };
  }

  /**
   * Update cache after a file modification.
   * Returns conflict if version doesn't match (OCC violation).
   */
  public update(
    filePath: string,
    newContent: string,
    tool: string,
    agentId?: string,
    summary?: string,
    expectedVersion?: number
  ): CacheUpdateResult {
    const existing = this.cache.get(filePath);
    const now = Date.now();

    // OCC conflict check
    if (existing && expectedVersion !== undefined && expectedVersion !== existing.version) {
      this.conflictsDetected++;
      const modificationsSinceRead = existing.modificationLog.filter(
        (m) => m.version > expectedVersion
      );
      return {
        status: 'conflict',
        version: existing.version,
        conflictInfo: {
          yourVersion: expectedVersion,
          currentVersion: existing.version,
          modifiedBy: existing.lastModifiedBy,
          modifiedAt: existing.lastModifiedAt,
          modificationsSinceRead,
          diffSinceRead:
            this.cacheMode === 'with_content' && existing.content
              ? this.generateDiff(filePath, existing.content, newContent)
              : undefined,
        },
      };
    }

    // No existing entry - create new one
    if (!existing) {
      const contentHash = this.computeHash(newContent);
      const contentBytes = Buffer.byteLength(newContent, 'utf8');
      const lines = newContent.split('\n');

      const newEntry: CacheEntry = {
        contentHash,
        content: this.cacheMode === 'with_content' ? newContent : '',
        contentBytes: this.cacheMode === 'with_content' ? contentBytes : 0,
        lineCount: lines.length,
        byteSize: contentBytes,
        firstReadAt: now,
        lastReadAt: now,
        lastExtract: 'content',
        readCount: 0,
        tokenCost: this.estimateTokens(newContent),
        tokensSaved: 0,
        version: 1,
        lastModifiedBy: agentId ?? tool,
        lastModifiedAt: now,
        modificationLog: [
          {
            version: 1,
            agentId,
            tool,
            timestamp: now,
            summary,
          },
        ],
      };

      this.cache.set(filePath, newEntry);
      if (this.cacheMode === 'with_content') {
        this.trackMemory(newEntry);
      }

      return {
        status: 'updated',
        version: 1,
      };
    }

    // Update existing entry
    const oldBytes = existing.contentBytes;
    const contentHash = this.computeHash(newContent);
    const contentBytes = Buffer.byteLength(newContent, 'utf8');

    existing.contentHash = contentHash;
    existing.content = this.cacheMode === 'with_content' ? newContent : '';
    existing.contentBytes = this.cacheMode === 'with_content' ? contentBytes : 0;
    existing.lineCount = newContent.split('\n').length;
    existing.byteSize = contentBytes;
    existing.tokenCost = this.estimateTokens(newContent);
    existing.version++;
    existing.lastModifiedBy = agentId ?? tool;
    existing.lastModifiedAt = now;

    // Add to modification log (bounded to 10 entries)
    const modEntry: ModEntry = {
      version: existing.version,
      agentId,
      tool,
      timestamp: now,
      summary,
    };
    existing.modificationLog.push(modEntry);
    if (existing.modificationLog.length > 10) {
      existing.modificationLog.shift();
    }

    if (this.cacheMode === 'with_content') {
      this.trackMemory(existing, oldBytes);
    }

    return {
      status: 'updated',
      version: existing.version,
    };
  }

  /**
   * Check if a file has been modified since last read (potential conflict).
   * Returns null if file not in cache.
   */
  public checkConflict(filePath: string, sinceVersion?: number): ConflictCheckResult | null {
    const entry = this.cache.get(filePath);
    if (!entry) {
      return null;
    }

    // When sinceVersion is not provided, default to 0 which means
    // any version > 0 will report as conflict. Callers should always
    // provide sinceVersion from a previous read's cache_version.
    const baseVersion = sinceVersion ?? 0;
    const hasConflict = entry.version > baseVersion;
    const modificationsSinceRead = sinceVersion !== undefined
      ? entry.modificationLog.filter((m) => m.version > sinceVersion)
      : entry.modificationLog;

    return {
      hasConflict,
      yourVersion: baseVersion,
      currentVersion: entry.version,
      modifiedBy: entry.lastModifiedBy,
      modificationsSinceRead,
    };
  }

  /**
   * Invalidate a cache entry (e.g., after external modification).
   */
  public invalidate(filePath: string): void {
    const entry = this.cache.get(filePath);
    if (entry) {
      this.totalContentBytes -= entry.contentBytes;
      this.cache.delete(filePath);
    }
  }

  /**
   * Clear all cache entries.
   */
  public clear(): void {
    this.cache.clear();
    this.totalContentBytes = 0;
    this.conflictsDetected = 0;
  }

  /**
   * Get session statistics for analytics.
   */
  public getStats(): SessionStats {
    const uniqueFilesRead = this.cache.size;
    let totalReads = 0;
    let cacheHits = 0;
    let tokensSaved = 0;

    const fileStats = Array.from(this.cache.entries()).map(([path, entry]) => ({
      path,
      reads: entry.readCount,
      tokensSaved: entry.tokensSaved,
      modifications: entry.modificationLog.length,
    }));

    for (const entry of this.cache.values()) {
      totalReads += entry.readCount;
      if (entry.readCount > 1) {
        cacheHits += entry.readCount - 1;
      }
      tokensSaved += entry.tokensSaved;
    }

    const cacheHitRate =
      totalReads > 0 ? ((cacheHits / totalReads) * 100).toFixed(1) + '%' : '0.0%';

    const mostReadFiles = fileStats
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 10)
      .map(({ path, reads, tokensSaved }) => ({ path, reads, tokensSaved }));

    const mostModifiedFiles = fileStats
      .filter((f) => f.modifications > 0)
      .sort((a, b) => b.modifications - a.modifications)
      .slice(0, 10)
      .map(({ path, modifications }) => ({ path, modifications }));

    return {
      uniqueFilesRead,
      totalReads,
      cacheHits,
      cacheHitRate,
      tokensSaved,
      memoryUsedMb: parseFloat((this.totalContentBytes / (1024 * 1024)).toFixed(2)),
      memoryBudgetMb: this.maxMemoryBytes / (1024 * 1024),
      conflictsDetected: this.conflictsDetected,
      mostReadFiles,
      mostModifiedFiles,
    };
  }

  /**
   * Get cache entry information for a specific file.
   */
  public getEntryInfo(filePath: string): CacheEntry | undefined {
    return this.cache.get(filePath);
  }
}

// Export as both default and named export
export default FileStateCache;
