/**
 * `@goodvibes/core/cache` — the §7.1 file-cache rebuild.
 *
 * Three features, no more:
 *  1. Freshness metadata on normal full responses: the handler always delivers
 *     the requested content; the cache only adds `unchanged_since_last_read` and
 *     a content hash. Information, never refusal.
 *  2. Explicit probe mode: "did these files change?" returns change-status with
 *     NO content — the caller opts into contentlessness.
 *  3. Stub-on-read is deleted; `tokens_saved` self-crediting is deleted. The
 *     legacy `tokensSaved` accumulator stays pinned at 0 so no self-credit can
 *     leak back in (the ported no-self-credit test asserts this).
 *
 * Adapted from the v1 Phase-0.5-rebuilt precision-engine `state/file-cache.ts`,
 * which already implements most of this.
 */

import { createHash } from 'crypto';
import { createPatch } from 'diff';
import { estimatePayloadTokens } from '../shared/tokens.js';
import { loadConfig } from '../config/index.js';

/** Modification-log entry for a file version. */
export interface ModEntry {
  version: number;
  agentId?: string;
  tool: string;
  timestamp: number;
  summary?: string;
}

/** Cache entry for a single file. */
export interface CacheEntry {
  contentHash: string;
  content: string;
  contentBytes: number;
  lineCount: number;
  byteSize: number;
  firstReadAt: number;
  lastReadAt: number;
  lastExtract: string;
  offset?: number;
  limit?: number;
  readCount: number;
  tokenCost: number;
  /** Legacy accumulator — self-crediting removed in the v2 rebuild (stays 0). */
  tokensSaved: number;
  version: number;
  lastModifiedBy?: string;
  lastModifiedAt?: number;
  modificationLog: ModEntry[];
}

/** Result of a cache lookup. */
export interface CacheLookupResult {
  status: 'miss' | 'unchanged' | 'modified';
  entry: CacheEntry;
  previousReadAt?: number;
  diff?: string;
  changes?: { added: number; removed: number; modifiedRanges: string[] };
  modifiedBy?: string;
  previousLineCount?: number;
}

/** Freshness metadata attached to a normal (content-bearing) response. */
export interface Freshness {
  /** True when the file is byte-identical to the previous read this session. */
  unchanged_since_last_read: boolean;
  /** sha256 of the current content. */
  content_hash: string;
}

/** Probe result — change status with NO content. */
export interface ProbeResult {
  path: string;
  status: 'miss' | 'unchanged' | 'modified';
  content_hash: string;
  unchanged_since_last_read: boolean;
}

/** Session statistics. */
export interface SessionStats {
  uniqueFilesRead: number;
  totalReads: number;
  cacheHits: number;
  cacheHitRate: string;
  tokensSaved: number;
  memoryUsedMb: number;
  memoryBudgetMb: number;
  mostReadFiles: { path: string; reads: number }[];
}

/** Session-scoped file-state cache. */
export class FileStateCache {
  private static instance: FileStateCache | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private totalContentBytes = 0;

  private get maxMemoryBytes(): number {
    const mb = loadConfig().cache_max_mb;
    return (typeof mb === 'number' && mb > 0 ? mb : 200) * 1024 * 1024;
  }

  private constructor() {}

  public static getInstance(): FileStateCache {
    return (FileStateCache.instance ??= new FileStateCache());
  }

  public static resetInstance(): void {
    FileStateCache.instance = null;
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private extractModifiedRanges(diff: string): string[] {
    const ranges: string[] = [];
    const hunkPattern = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
    let match: RegExpExecArray | null;
    while ((match = hunkPattern.exec(diff)) !== null) {
      const startLine = parseInt(match[3], 10);
      const lineCount = match[4] ? parseInt(match[4], 10) : 1;
      const endLine = startLine + lineCount - 1;
      ranges.push(lineCount === 1 ? String(startLine) : `${startLine}-${endLine}`);
    }
    return ranges;
  }

  private countDiffChanges(diff: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of diff.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) {added++;}
      else if (line.startsWith('-') && !line.startsWith('---')) {removed++;}
    }
    return { added, removed };
  }

  private generateDiff(filePath: string, oldContent: string, newContent: string): string {
    return createPatch(filePath, oldContent, newContent, '', '', { context: 3 });
  }

  private trackMemory(entry: CacheEntry, oldBytes?: number): void {
    if (oldBytes !== undefined) {this.totalContentBytes -= oldBytes;}
    this.totalContentBytes += entry.contentBytes;
    while (this.totalContentBytes > this.maxMemoryBytes && this.cache.size > 1) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    let oldestPath: string | null = null;
    let oldestTime = Infinity;
    for (const [p, entry] of this.cache.entries()) {
      if (entry.lastReadAt < oldestTime) {
        oldestTime = entry.lastReadAt;
        oldestPath = p;
      }
    }
    if (oldestPath) {
      const evicted = this.cache.get(oldestPath);
      if (evicted) {
        this.totalContentBytes -= evicted.contentBytes;
        this.cache.delete(oldestPath);
      }
    }
  }

  /**
   * Look up a file and determine whether its content changed. The handler still
   * delivers the content; this only reports freshness (never a stub).
   */
  public lookup(
    filePath: string,
    content: string,
    extract: string,
    offset?: number,
    limit?: number,
  ): CacheLookupResult {
    const contentHash = this.computeHash(content);
    const existing = this.cache.get(filePath);
    const now = Date.now();

    if (!existing) {
      const contentBytes = Buffer.byteLength(content, 'utf8');
      const newEntry: CacheEntry = {
        contentHash,
        content,
        contentBytes,
        lineCount: content.split('\n').length,
        byteSize: contentBytes,
        firstReadAt: now,
        lastReadAt: now,
        lastExtract: extract,
        offset,
        limit,
        readCount: 1,
        tokenCost: estimatePayloadTokens(content),
        tokensSaved: 0,
        version: 1,
        modificationLog: [],
      };
      this.cache.set(filePath, newEntry);
      this.trackMemory(newEntry);
      return { status: 'miss', entry: newEntry };
    }

    const oldBytes = existing.contentBytes;
    const previousReadAt = existing.lastReadAt;
    existing.lastReadAt = now;
    existing.readCount++;
    existing.lastExtract = extract;
    existing.offset = offset;
    existing.limit = limit;

    // Unchanged: a freshness hit. No token self-crediting — the handler always
    // delivers the requested content; the cache only adds freshness.
    if (contentHash === existing.contentHash) {
      return { status: 'unchanged', entry: existing, previousReadAt };
    }

    const previousLineCount = existing.lineCount;
    const diff = this.generateDiff(filePath, existing.content, content);
    const counts = this.countDiffChanges(diff);
    const changes = { added: counts.added, removed: counts.removed, modifiedRanges: this.extractModifiedRanges(diff) };

    const contentBytes = Buffer.byteLength(content, 'utf8');
    existing.contentHash = contentHash;
    existing.content = content;
    existing.contentBytes = contentBytes;
    existing.lineCount = content.split('\n').length;
    existing.byteSize = contentBytes;
    existing.tokenCost = estimatePayloadTokens(content);
    this.trackMemory(existing, oldBytes);

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
   * Probe mode: report whether a file changed since the last read WITHOUT
   * returning content. The caller opts into contentlessness. A probe does not
   * count as a content read (readCount is left untouched), but it does refresh
   * the stored hash so a later probe/lookup measures against the latest content.
   */
  public probe(filePath: string, content: string): ProbeResult {
    const contentHash = this.computeHash(content);
    const existing = this.cache.get(filePath);
    if (!existing) {
      // Register the hash (readCount 0 — a probe is not a content read) so a
      // subsequent probe/lookup can report freshness against it.
      const now = Date.now();
      const contentBytes = Buffer.byteLength(content, 'utf8');
      const entry: CacheEntry = {
        contentHash,
        content,
        contentBytes,
        lineCount: content.split('\n').length,
        byteSize: contentBytes,
        firstReadAt: now,
        lastReadAt: now,
        lastExtract: 'probe',
        readCount: 0,
        tokenCost: estimatePayloadTokens(content),
        tokensSaved: 0,
        version: 1,
        modificationLog: [],
      };
      this.cache.set(filePath, entry);
      this.trackMemory(entry);
      return { path: filePath, status: 'miss', content_hash: contentHash, unchanged_since_last_read: false };
    }
    if (existing.contentHash === contentHash) {
      return { path: filePath, status: 'unchanged', content_hash: contentHash, unchanged_since_last_read: true };
    }
    // Content changed since the last read: update the stored hash so subsequent
    // probes compare against the newest content, but do not deliver a diff here.
    const oldBytes = existing.contentBytes;
    existing.contentHash = contentHash;
    existing.content = content;
    existing.contentBytes = Buffer.byteLength(content, 'utf8');
    existing.lineCount = content.split('\n').length;
    existing.byteSize = existing.contentBytes;
    this.trackMemory(existing, oldBytes);
    return { path: filePath, status: 'modified', content_hash: contentHash, unchanged_since_last_read: false };
  }

  /** Derive the freshness block to attach to a normal content response. */
  public freshness(result: CacheLookupResult): Freshness {
    return {
      unchanged_since_last_read: result.status === 'unchanged',
      content_hash: result.entry.contentHash,
    };
  }

  /** Register content written by a tool so a later lookup is a freshness hit. */
  public update(filePath: string, newContent: string, tool: string, agentId?: string, summary?: string): void {
    const now = Date.now();
    const existing = this.cache.get(filePath);
    const contentBytes = Buffer.byteLength(newContent, 'utf8');
    if (!existing) {
      const entry: CacheEntry = {
        contentHash: this.computeHash(newContent),
        content: newContent,
        contentBytes,
        lineCount: newContent.split('\n').length,
        byteSize: contentBytes,
        firstReadAt: now,
        lastReadAt: now,
        lastExtract: 'content',
        readCount: 0,
        tokenCost: estimatePayloadTokens(newContent),
        tokensSaved: 0,
        version: 1,
        lastModifiedBy: agentId ?? tool,
        lastModifiedAt: now,
        modificationLog: [{ version: 1, agentId, tool, timestamp: now, summary }],
      };
      this.cache.set(filePath, entry);
      this.trackMemory(entry);
      return;
    }
    const oldBytes = existing.contentBytes;
    existing.contentHash = this.computeHash(newContent);
    existing.content = newContent;
    existing.contentBytes = contentBytes;
    existing.lineCount = newContent.split('\n').length;
    existing.byteSize = contentBytes;
    existing.tokenCost = estimatePayloadTokens(newContent);
    existing.version++;
    existing.lastModifiedBy = agentId ?? tool;
    existing.lastModifiedAt = now;
    existing.modificationLog.push({ version: existing.version, agentId, tool, timestamp: now, summary });
    if (existing.modificationLog.length > 10) {existing.modificationLog.shift();}
    this.trackMemory(existing, oldBytes);
  }

  public invalidate(filePath: string): void {
    const entry = this.cache.get(filePath);
    if (entry) {
      this.totalContentBytes -= entry.contentBytes;
      this.cache.delete(filePath);
    }
  }

  public clear(): void {
    this.cache.clear();
    this.totalContentBytes = 0;
  }

  public getEntryInfo(filePath: string): CacheEntry | undefined {
    return this.cache.get(filePath);
  }

  public getStats(): SessionStats {
    let totalReads = 0;
    let cacheHits = 0;
    const fileStats = Array.from(this.cache.entries()).map(([p, entry]) => ({ path: p, reads: entry.readCount }));
    for (const entry of this.cache.values()) {
      totalReads += entry.readCount;
      if (entry.readCount > 1) {cacheHits += entry.readCount - 1;}
    }
    const cacheHitRate = totalReads > 0 ? `${((cacheHits / totalReads) * 100).toFixed(1)}%` : '0.0%';
    return {
      uniqueFilesRead: this.cache.size,
      totalReads,
      cacheHits,
      cacheHitRate,
      // tokens_saved is deleted from the response surface; getStats reports 0.
      tokensSaved: 0,
      memoryUsedMb: parseFloat((this.totalContentBytes / (1024 * 1024)).toFixed(2)),
      memoryBudgetMb: this.maxMemoryBytes / (1024 * 1024),
      mostReadFiles: fileStats.sort((a, b) => b.reads - a.reads).slice(0, 10),
    };
  }
}

export default FileStateCache;
