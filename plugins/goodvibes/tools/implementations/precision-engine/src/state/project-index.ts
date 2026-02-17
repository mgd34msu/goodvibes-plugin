/**
 * ProjectIndex - Session-scoped singleton for managing in-memory project file index.
 * Provides fast lookups by path, type, and prefix with lazy disk persistence.
 */

import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Index format stored in .goodvibes/project-index.json (version 2)
 */
export interface ProjectFileIndex {
  version: 2;
  created_at: string;           // ISO timestamp
  updated_at: string;           // ISO timestamp
  project_root: string;         // Absolute path
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
  };
  /** Directory tree: maps directory paths to filename arrays. Empty string key ('') holds root-level files. */
  tree: Record<string, string[]>;
}

/**
 * Legacy index format (version 1) for backward compatibility.
 */
interface LegacyProjectFileIndex {
  version: 1;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    total_size_bytes: number;
    index_duration_ms: number;
  };
  files: Array<{ p: string; s: number; m: number; t?: string }>;
}

/**
 * Individual file entry in the in-memory index.
 * Only path is stored — type is derived on-demand from extension.
 */
export interface FileEntry {
  p: string;    // Relative path from project root
}

/**
 * ProjectIndex singleton manages the in-memory index with lazy persistence.
 */
export class ProjectIndex {
  private static instance: ProjectIndex | null = null;
  private index: ProjectFileIndex | null = null;
  // Internal flat list for efficient binary search operations
  private files: FileEntry[] = [];
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
   * Flatten a tree object into a sorted FileEntry array.
   */
  private static flattenTree(tree: Record<string, string[]>): FileEntry[] {
    const entries: FileEntry[] = [];
    for (const [dir, filenames] of Object.entries(tree)) {
      for (const name of filenames) {
        const p = dir ? `${dir}/${name}` : name;
        entries.push({ p });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }

  /**
   * Convert an internal FileEntry array back to tree format for disk write.
   */
  private static entriesToTree(entries: FileEntry[]): Record<string, string[]> {
    const tree: Record<string, string[]> = {};
    for (const entry of entries) {
      const slashIdx = entry.p.lastIndexOf('/');
      const dir = slashIdx === -1 ? '' : entry.p.substring(0, slashIdx);
      const name = slashIdx === -1 ? entry.p : entry.p.substring(slashIdx + 1);
      if (!tree[dir]) tree[dir] = [];
      tree[dir].push(name);
    }
    // Sort filenames within each directory
    for (const key of Object.keys(tree)) {
      tree[key].sort();
    }
    return tree;
  }

  /**
   * Load index from disk if not already loaded.
   */
  public async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (existsSync(this.indexPath)) {
        const content = await readFile(this.indexPath, 'utf-8');
        const parsed = JSON.parse(content);

        if (!parsed) {
          this.index = null;
          this.files = [];
        } else if (parsed.version === 2) {
          // Current format: tree-based
          this.index = parsed as ProjectFileIndex;
          this.files = ProjectIndex.flattenTree(parsed.tree || {});
        } else if (parsed.version === 1) {
          // Legacy format: flat files array — convert to v2
          const legacy = parsed as LegacyProjectFileIndex;
          const tree = ProjectIndex.entriesToTree(
            (legacy.files || []).map((f) => ({ p: f.p }))
          );
          this.index = {
            version: 2,
            created_at: legacy.created_at,
            updated_at: legacy.updated_at,
            project_root: legacy.project_root,
            stats: {
              total_files: legacy.stats.total_files,
              total_dirs: legacy.stats.total_dirs,
              index_duration_ms: legacy.stats.index_duration_ms,
            },
            tree,
          };
          this.files = ProjectIndex.flattenTree(tree);
        } else {
          console.error(`[ProjectIndex] Unsupported index version: ${parsed?.version}`);
          this.index = null;
          this.files = [];
        }
      } else {
        // Index doesn't exist yet - will be created on first session start
        this.index = null;
        this.files = [];
      }
    } catch (error) {
      // Corrupt or unreadable index - reset to null
      console.error('[ProjectIndex] Failed to load index:', error);
      this.index = null;
      this.files = [];
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
   * Get the internal flat files list (for queries).
   */
  public getFiles(): FileEntry[] {
    return this.files;
  }

  /**
   * Get summary statistics from the index.
   */
  public getStats(): ProjectFileIndex['stats'] | null {
    if (!this.index) return null;
    return this.index.stats;
  }

  /**
   * Add or update a file entry in the index.
   */
  public upsertFile(relativePath: string): void {
    if (!this.index) return;

    const newEntry: FileEntry = { p: relativePath };

    const existingIndex = this.findEntryIndex(relativePath);
    if (existingIndex >= 0) {
      // Update existing entry
      this.files[existingIndex] = newEntry;
    } else {
      // Insert new entry maintaining sort order
      this.insertSorted(newEntry);
      this.index.stats.total_files++;
    }

    // ISO string for ProjectFileIndex.updated_at
    this.index.updated_at = new Date().toISOString();
    this.markDirty();
  }

  /**
   * Alias for upsertFile (used after edits).
   */
  public touchFile(relativePath: string): void {
    this.upsertFile(relativePath);
  }

  /**
   * Remove a file from the index.
   * Note: stats.total_dirs may be stale until the next flush (500ms debounce).
   */
  public removeFile(relativePath: string): void {
    if (!this.index) return;

    const idx = this.findEntryIndex(relativePath);
    if (idx >= 0) {
      this.files.splice(idx, 1);
      this.index.stats.total_files--;
      this.index.updated_at = new Date().toISOString();
      this.markDirty();
    }
  }

  /**
   * Get files filtered by type (derived from extension).
   */
  public getFilesByType(type: string): FileEntry[] {
    return this.files.filter((f) => categorizeFileType(f.p) === type);
  }

  /**
   * Get files matching a path prefix.
   */
  public getFilesByPrefix(prefix: string): FileEntry[] {
    // Binary search for the start of the range
    const files = this.files;
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
   * Get file type breakdown (derived from extension).
   */
  public getTypeCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const file of this.files) {
      const type = categorizeFileType(file.p);
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Find the index of a file entry by path using binary search.
   * Returns -1 if not found.
   */
  private findEntryIndex(p: string): number {
    const files = this.files;
    let left = 0;
    let right = files.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      // Use consistent comparison with insertSorted() and getFilesByPrefix()
      const cmp = files[mid].p < p ? -1 : files[mid].p > p ? 1 : 0;

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
    const files = this.files;
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

      // Rebuild tree from current files list
      const tree = ProjectIndex.entriesToTree(this.files);
      const indexToWrite: ProjectFileIndex = {
        ...this.index,
        stats: {
          ...this.index.stats,
          total_dirs: Object.keys(tree).length,
        },
        tree,
      };

      // Atomic write: temp file + rename
      const tempPath = this.indexPath + '.tmp';
      await writeFile(tempPath, JSON.stringify(indexToWrite) + '\n', 'utf-8');
      await rename(tempPath, this.indexPath);

      this.dirty = false;
    } catch (error) {
      // Keep dirty flag for retry
      console.error('[ProjectIndex] Failed to flush index:', error);
    } finally {
      // Timer has fired — null it regardless of outcome.
      // If flush failed, dirty remains true, and next markDirty() will schedule a retry.
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
