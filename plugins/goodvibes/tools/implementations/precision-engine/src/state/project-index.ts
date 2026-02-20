/**
 * ProjectIndex - Session-scoped singleton for managing in-memory project file index.
 * Provides fast lookups by path, type, and prefix with lazy disk persistence.
 */

import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Index format stored in .goodvibes/project-index.json (version 4)
 */
export interface ProjectFileIndex {
  /** Human/LLM-readable description of the tree format */
  _format?: string;
  version: 4;
  created_at: string;           // ISO timestamp
  updated_at: string;           // ISO timestamp
  project_root: string;         // Absolute path
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
    partial?: boolean;
  };
  /** Directory tree: maps directory paths to filename→tokens maps. Empty string key ('') holds root-level files. */
  tree: Record<string, Record<string, number>>;
}

/**
 * V3 index format (array-of-objects tree) for migration.
 */
interface ProjectFileIndexV3 {
  version: 3;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
    partial?: boolean;
  };
  tree: Record<string, Array<{ name: string; size: number; tokens: number }>>;
}

/**
 * V2 index format (string-based tree) for migration.
 */
interface ProjectFileIndexV2 {
  version: 2;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
  };
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
 * Path and tokens are stored for efficient lookup and planning.
 */
export interface FileEntry {
  p: string;      // Relative path from project root
  tokens: number; // Estimated token count
}

/**
 * ProjectIndex singleton manages the in-memory index with lazy persistence.
 */
/**
 * Self-documenting format hint written to disk so agents can parse the index without prior knowledge.
 * Exported as a standalone constant to avoid bundling the full ProjectIndex class in build-index.cjs.
 */
export const FORMAT_HINT = 'tree: { "directory/": { "file.ext": token_count } }';

export class ProjectIndex {
  /** Self-documenting format hint written to disk so agents can parse the index without prior knowledge. */
  public static readonly FORMAT_HINT = FORMAT_HINT;

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
   * Flatten a v4 tree object into a sorted FileEntry array.
   */
  private static flattenTree(tree: Record<string, Record<string, number>>): FileEntry[] {
    const entries: FileEntry[] = [];
    for (const [dir, files] of Object.entries(tree)) {
      for (const [name, tokens] of Object.entries(files)) {
        const p = dir ? `${dir}/${name}` : name;
        entries.push({ p, tokens });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }

  /**
   * Flatten a v3 tree (array-of-objects) into a sorted FileEntry array.
   * Used during v3→v4 migration.
   */
  private static flattenTreeV3(tree: Record<string, Array<{ name: string; size: number; tokens: number }>>): FileEntry[] {
    const entries: FileEntry[] = [];
    for (const [dir, fileEntries] of Object.entries(tree)) {
      for (const entry of fileEntries) {
        const p = dir ? `${dir}/${entry.name}` : entry.name;
        entries.push({ p, tokens: entry.tokens });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }

  /**
   * Flatten a v2 tree (string arrays) into a sorted FileEntry array.
   * Used during v2→v4 migration where no token data is available.
   */
  private static flattenTreeV2(tree: Record<string, string[]>): FileEntry[] {
    const entries: FileEntry[] = [];
    for (const [dir, filenames] of Object.entries(tree)) {
      for (const name of filenames) {
        const p = dir ? `${dir}/${name}` : name;
        entries.push({ p, tokens: 0 });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }

  /**
   * Convert an internal FileEntry array back to v4 tree format for disk write.
   */
  private static entriesToTree(entries: FileEntry[]): Record<string, Record<string, number>> {
    const tree: Record<string, Record<string, number>> = {};
    for (const entry of entries) {
      const slashIdx = entry.p.lastIndexOf('/');
      const dir = slashIdx === -1 ? '' : entry.p.substring(0, slashIdx);
      const name = slashIdx === -1 ? entry.p : entry.p.substring(slashIdx + 1);
      if (!tree[dir]) tree[dir] = {};
      tree[dir][name] = entry.tokens;
    }
    // Sort keys within each directory for determinism
    for (const key of Object.keys(tree)) {
      const sorted: Record<string, number> = {};
      for (const name of Object.keys(tree[key]).sort()) {
        sorted[name] = tree[key][name];
      }
      tree[key] = sorted;
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
        } else if (parsed.version === 4) {
          // Current format: v4 tree with filename→tokens maps
          this.index = parsed as ProjectFileIndex;
          this.files = ProjectIndex.flattenTree(parsed.tree || {});
          // Backfill _format if missing (pre-format indexes)
          if (!this.index._format) {
            this.index._format = ProjectIndex.FORMAT_HINT;
            this.markDirty();
          }
        } else if (parsed.version === 3) {
          // V3 format: tree with array-of-objects — migrate to v4
          const v3 = parsed as ProjectFileIndexV3;
          const v3tree = v3.tree || {};
          this.files = ProjectIndex.flattenTreeV3(v3tree);
          const v4tree = ProjectIndex.entriesToTree(this.files);
          this.index = {
            _format: ProjectIndex.FORMAT_HINT,
            version: 4,
            created_at: v3.created_at,
            updated_at: v3.updated_at,
            project_root: v3.project_root,
            stats: v3.stats,
            tree: v4tree,
          };
          this.markDirty(); // auto-flush to v4
        } else if (parsed.version === 2) {
          // V2 format: tree with string arrays — migrate to v4 (tokens unknown, set to 0)
          const v2 = parsed as ProjectFileIndexV2;
          const v2tree = v2.tree || {};
          this.files = ProjectIndex.flattenTreeV2(v2tree);
          const v4tree = ProjectIndex.entriesToTree(this.files);
          this.index = {
            _format: ProjectIndex.FORMAT_HINT,
            version: 4,
            created_at: v2.created_at,
            updated_at: v2.updated_at,
            project_root: v2.project_root,
            stats: {
              total_files: v2.stats.total_files,
              total_dirs: v2.stats.total_dirs,
              index_duration_ms: v2.stats.index_duration_ms,
            },
            tree: v4tree,
          };
          this.markDirty(); // auto-flush to v4
        } else if (parsed.version === 1) {
          // Legacy format: flat files array — migrate to v4
          const legacy = parsed as LegacyProjectFileIndex;
          this.files = (legacy.files || []).map((f) => ({ p: f.p, tokens: 0 }));
          this.files.sort((a, b) => a.p.localeCompare(b.p));
          const tree = ProjectIndex.entriesToTree(this.files);
          this.index = {
            _format: ProjectIndex.FORMAT_HINT,
            version: 4,
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
          this.markDirty(); // auto-flush to v4
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
   * @param relativePath - Path relative to project root
   * @param tokens - Estimated token count (optional; 0 if unknown)
   */
  public upsertFile(relativePath: string, tokens = 0): void {
    if (!this.index) return;

    const newEntry: FileEntry = { p: relativePath, tokens };

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
   * Alias for upsertFile (used after edits — tokens unknown, keeps existing or sets 0).
   */
  public touchFile(relativePath: string): void {
    // Preserve existing tokens if entry already exists
    const existingIdx = this.findEntryIndex(relativePath);
    const existingTokens = existingIdx >= 0 ? this.files[existingIdx].tokens : 0;
    this.upsertFile(relativePath, existingTokens);
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
        version: this.index.version,
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
