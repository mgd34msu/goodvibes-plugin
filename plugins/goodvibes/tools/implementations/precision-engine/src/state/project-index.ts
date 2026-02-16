/**
 * ProjectIndex - Session-scoped singleton for managing in-memory project file index.
 * Provides fast lookups by path, type, and prefix with lazy disk persistence.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Index format stored in .goodvibes/project-index.json
 */
export interface ProjectFileIndex {
  version: 1;
  created_at: string;           // ISO timestamp
  updated_at: string;           // ISO timestamp
  project_root: string;         // Absolute path
  stats: {
    total_files: number;
    total_dirs: number;
    total_size_bytes: number;
    index_duration_ms: number;
  };
  files: FileEntry[];           // Sorted by path
}

/**
 * Individual file entry in the index.
 */
export interface FileEntry {
  p: string;    // Relative path from project root
  s: number;    // Size in bytes
  m: number;    // Modified time (Unix ms)
  t?: string;   // File type category
}

/**
 * ProjectIndex singleton manages the in-memory index with lazy persistence.
 */
export class ProjectIndex {
  private static instance: ProjectIndex | null = null;
  private index: ProjectFileIndex | null = null;
  private loaded = false;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly indexPath: string;

  private constructor() {
    this.indexPath = path.join(process.cwd(), '.goodvibes', 'project-index.json');
  }

  /**
   * Get the singleton instance.
   */
  public static getInstance(): ProjectIndex {
    if (!ProjectIndex.instance) {
      ProjectIndex.instance = new ProjectIndex();
    }
    return ProjectIndex.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  public static resetInstance(): void {
    if (ProjectIndex.instance?.flushTimer) {
      clearTimeout(ProjectIndex.instance.flushTimer);
    }
    ProjectIndex.instance = null;
  }

  /**
   * Load index from disk if not already loaded.
   */
  public async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (existsSync(this.indexPath)) {
        const content = await readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(content);
      } else {
        // Index doesn't exist yet - will be created on first session start
        this.index = null;
      }
    } catch (error) {
      // Corrupt or unreadable index - reset to null
      console.error('[ProjectIndex] Failed to load index:', error);
      this.index = null;
    }

    this.loaded = true;
  }

  /**
   * Get the loaded index, loading from disk if needed.
   */
  public async getIndexLoaded(): Promise<ProjectFileIndex | null> {
    await this.load();
    return this.index;
  }

  /**
   * Get the current index without loading from disk.
   */
  public getIndex(): ProjectFileIndex | null {
    return this.index;
  }

  /**
   * Get summary statistics from the index.
   */
  public getStats(): object | null {
    if (!this.index) return null;
    return this.index.stats;
  }

  /**
   * Add or update a file entry in the index.
   */
  public upsertFile(relativePath: string, sizeBytes: number): void {
    if (!this.index) return;

    const now = Date.now();
    const fileType = categorizeFileType(relativePath);
    const newEntry: FileEntry = {
      p: relativePath,
      s: sizeBytes,
      m: now,
      t: fileType,
    };

    const existingIndex = this.findEntryIndex(relativePath);
    if (existingIndex >= 0) {
      // Update existing entry
      const oldEntry = this.index.files[existingIndex];
      const sizeDelta = sizeBytes - oldEntry.s;
      this.index.files[existingIndex] = newEntry;
      this.index.stats.total_size_bytes += sizeDelta;
    } else {
      // Insert new entry maintaining sort order
      this.insertSorted(newEntry);
      this.index.stats.total_files++;
      this.index.stats.total_size_bytes += sizeBytes;
    }

    this.index.updated_at = new Date().toISOString();
    this.markDirty();
  }

  /**
   * Alias for upsertFile (used after edits).
   */
  public touchFile(relativePath: string, sizeBytes: number): void {
    this.upsertFile(relativePath, sizeBytes);
  }

  /**
   * Remove a file from the index.
   */
  public removeFile(relativePath: string): void {
    if (!this.index) return;

    const idx = this.findEntryIndex(relativePath);
    if (idx >= 0) {
      const entry = this.index.files[idx];
      this.index.files.splice(idx, 1);
      this.index.stats.total_files--;
      this.index.stats.total_size_bytes -= entry.s;
      this.index.updated_at = new Date().toISOString();
      this.markDirty();
    }
  }

  /**
   * Get files filtered by type.
   */
  public getFilesByType(type: string): FileEntry[] {
    if (!this.index) return [];
    return this.index.files.filter((f) => f.t === type);
  }

  /**
   * Get files matching a path prefix.
   */
  public getFilesByPrefix(prefix: string): FileEntry[] {
    if (!this.index) return [];

    // Binary search for the start of the range
    const files = this.index.files;
    let left = 0;
    let right = files.length;

    // Find first entry >= prefix
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (files[mid].p < prefix) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Collect all entries with matching prefix
    const result: FileEntry[] = [];
    for (let i = left; i < files.length && files[i].p.startsWith(prefix); i++) {
      result.push(files[i]);
    }

    return result;
  }

  /**
   * Get file type breakdown.
   */
  public getTypeCounts(): Record<string, number> {
    if (!this.index) return {};

    const counts: Record<string, number> = {};
    for (const file of this.index.files) {
      const type = file.t || 'other';
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Find a file entry by path using binary search.
   */
  private findEntry(p: string): FileEntry | null {
    const idx = this.findEntryIndex(p);
    return idx >= 0 ? this.index!.files[idx] : null;
  }

  /**
   * Find the index of a file entry by path using binary search.
   * Returns -1 if not found.
   */
  private findEntryIndex(p: string): number {
    if (!this.index) return -1;

    const files = this.index.files;
    let left = 0;
    let right = files.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = files[mid].p.localeCompare(p);

      if (cmp === 0) {
        return mid;
      } else if (cmp < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return -1;
  }

  /**
   * Insert an entry maintaining sorted order.
   */
  private insertSorted(entry: FileEntry): void {
    if (!this.index) return;

    const files = this.index.files;
    let left = 0;
    let right = files.length;

    // Binary search for insertion point
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (files[mid].p < entry.p) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    files.splice(left, 0, entry);
  }

  /**
   * Mark the index as dirty and schedule a debounced flush.
   */
  private markDirty(): void {
    this.dirty = true;

    // Clear existing timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Schedule new flush after 500ms
    this.flushTimer = setTimeout(() => {
      this.flush().catch((error) => {
        console.error('[ProjectIndex] Flush failed:', error);
      });
    }, 500);
  }

  /**
   * Flush the index to disk atomically.
   */
  private async flush(): Promise<void> {
    if (!this.dirty || !this.index) return;

    try {
      // Ensure directory exists
      await mkdir(path.dirname(this.indexPath), { recursive: true });

      // Atomic write: temp file + rename
      const tempPath = this.indexPath + '.tmp';
      await writeFile(tempPath, JSON.stringify(this.index), 'utf-8');
      await import('fs/promises').then((fs) => fs.rename(tempPath, this.indexPath));

      this.dirty = false;
    } catch (error) {
      // Keep dirty flag for retry
      console.error('[ProjectIndex] Failed to flush index:', error);
    } finally {
      // Clear timer reference
      this.flushTimer = null;
    }
  }

  /**
   * Force an immediate flush (useful for cleanup/shutdown).
   */
  public async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Categorize a file by its extension into a type category.
 */
export function categorizeFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().slice(1); // Remove leading dot

  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'ts';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'js';
    case 'json':
      return 'json';
    case 'md':
    case 'mdx':
      return 'md';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'py':
      return 'py';
    case 'go':
      return 'go';
    case 'rs':
      return 'rs';
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      return 'other';
  }
}

/**
 * Singleton instance of ProjectIndex for managing project file index.
 */
export const projectIndex = ProjectIndex.getInstance();
