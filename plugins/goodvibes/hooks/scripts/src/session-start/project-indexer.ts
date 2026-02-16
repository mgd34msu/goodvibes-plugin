/**
 * Project File Indexer
 *
 * Builds an initial file index at session start for efficient file system operations.
 * Uses Node.js built-in fs.readdir with recursive option (Node 20+) to avoid dependencies.
 *
 * The index is written to .goodvibes/project-index.json and used by precision-engine
 * tools for fast file lookups without hitting the filesystem repeatedly.
 */

import { readdir, stat, writeFile, mkdir, rename } from 'fs/promises';
import path from 'path';
import { debug, logError } from '../shared/index.js';

/**
 * Directories and patterns to exclude from the index.
 * These are typically build artifacts, dependencies, and cache directories.
 */
const INDEX_EXCLUSIONS = [
  'node_modules',
  '.git',
  '.goodvibes',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '__pycache__',
  '.cache',
  '.turbo',
  '.vercel',
  '.netlify',
  'coverage',
  '.nyc_output',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'venv',
  '.venv',
  'target',
];

const INDEX_EXCLUSIONS_SET = new Set(INDEX_EXCLUSIONS);

/**
 * File extensions to exclude (typically minified or generated files).
 */
const EXCLUDED_EXTENSIONS = [
  '.min.js',
  '.min.css',
  '.map',
  '.lock',
];

/**
 * Specific filenames to exclude (lock files).
 */
const EXCLUDED_FILENAMES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'bun.lockb',
];

/**
 * File entry in the project index.
 * Compact format to minimize index size.
 */
interface FileEntry {
  /** Relative path from project root */
  p: string;
  /** Size in bytes */
  s: number;
  /** Modified time as Unix timestamp (ms) */
  m: number;
  /** File type category (optional) */
  t?: string;
}

/**
 * Project file index structure.
 * Must match the format expected by precision-engine's ProjectIndex class.
 */
interface ProjectFileIndex {
  version: 1;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    total_size_bytes: number;
    index_duration_ms: number;
    partial?: boolean;
  };
  files: FileEntry[];
}

/**
 * Check if a file or directory should be excluded from the index.
 *
 * @param name - File or directory name
 * @param relativePath - Path relative to project root
 * @returns true if the file/directory should be excluded
 */
function shouldExclude(name: string, relativePath: string): boolean {
  // Check if any path segment matches exclusion list
  const segments = relativePath.split(path.sep);
  for (const segment of segments) {
    if (INDEX_EXCLUSIONS_SET.has(segment)) {
      return true;
    }
  }

  // Check excluded filenames
  if (EXCLUDED_FILENAMES.includes(name)) {
    return true;
  }

  // Check excluded extensions
  for (const ext of EXCLUDED_EXTENSIONS) {
    if (name.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Categorize a file by its extension.
 * Must match precision-engine's file type categories.
 *
 * @param filePath - Path to the file
 * @returns File type category string
 */
function categorizeFileType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'ts';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'js';
    case '.json':
      return 'json';
    case '.md':
    case '.mdx':
      return 'md';
    case '.css':
    case '.scss':
    case '.less':
      return 'css';
    case '.html':
    case '.htm':
      return 'html';
    case '.py':
      return 'py';
    case '.go':
      return 'go';
    case '.rs':
      return 'rs';
    case '.yaml':
    case '.yml':
      return 'yaml';
    default:
      return undefined;
  }
}

/**
 * Count unique directories from file paths.
 *
 * @param entries - Array of file entries
 * @returns Number of unique directories
 */
function countUniqueDirs(entries: FileEntry[]): number {
  const dirs = new Set<string>();
  for (const entry of entries) {
    const dir = path.dirname(entry.p);
    if (dir && dir !== '.') {
      dirs.add(dir);
    }
  }
  return dirs.size;
}

/**
 * Build the project file index.
 *
 * Recursively scans the project directory, categorizes files, and writes
 * a sorted index to .goodvibes/project-index.json.
 *
 * @param projectDir - Absolute path to the project root
 */
export async function buildProjectIndex(projectDir: string): Promise<void> {
  const startMs = Date.now();
  const entries: FileEntry[] = [];
  let isPartial = false;

  try {
    debug('Building project file index', { projectDir });

    // Use Node.js built-in recursive readdir (Node 20+)
    const dirEntries = await readdir(projectDir, {
      recursive: true,
      withFileTypes: true,
    });

    // Collect all file entries first (avoid N+1 stat calls)
    const pendingFiles: Array<{ name: string; relativePath: string; fullPath: string }> = [];

    for (const entry of dirEntries) {
      // Check timeout (30 seconds max)
      if (Date.now() - startMs > 30000) {
        debug('Project indexing timeout - writing partial index');
        isPartial = true;
        break;
      }

      // Skip directories
      if (!entry.isFile()) {
        continue;
      }

      // Build relative path with Node 20.0-20.11 compatibility
      const parent = entry.parentPath ?? (entry as any).path;
      const relativePath = parent
        ? path.relative(projectDir, path.join(parent, entry.name))
        : entry.name;

      // Check if should be excluded
      if (shouldExclude(entry.name, relativePath)) {
        continue;
      }

      const fullPath = path.join(projectDir, relativePath);
      pendingFiles.push({ name: entry.name, relativePath, fullPath });
    }

    // Batch stat calls with controlled concurrency
    const BATCH_SIZE = 100;
    for (let i = 0; i < pendingFiles.length; i += BATCH_SIZE) {
      const batch = pendingFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((f) =>
          stat(f.fullPath)
            .then((s) => ({ ...f, size: s.size, mtimeMs: s.mtimeMs }))
            .catch(() => null)
        )
      );
      for (const result of results) {
        if (result) {
          const type = categorizeFileType(result.relativePath);
          const entry: FileEntry = {
            p: result.relativePath,
            s: result.size,
            m: Math.floor(result.mtimeMs),
          };
          if (type) entry.t = type;
          entries.push(entry);
        }
      }
    }

    // Sort by path for binary search compatibility
    entries.sort((a, b) => a.p.localeCompare(b.p));

    // Build index
    const index: ProjectFileIndex = {
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_root: projectDir,
      stats: {
        total_files: entries.length,
        total_dirs: countUniqueDirs(entries),
        total_size_bytes: entries.reduce((sum, e) => sum + e.s, 0),
        index_duration_ms: Date.now() - startMs,
        ...(isPartial && { partial: true }),
      },
      files: entries,
    };

    // Write atomically: temp file + rename
    const indexDir = path.join(projectDir, '.goodvibes');
    const indexPath = path.join(indexDir, 'project-index.json');
    const tempPath = indexPath + '.tmp';

    await mkdir(indexDir, { recursive: true });
    await writeFile(tempPath, JSON.stringify(index) + '\n', 'utf-8');
    await rename(tempPath, indexPath);

    debug('Project index created', {
      files: entries.length,
      dirs: index.stats.total_dirs,
      size_mb: (index.stats.total_size_bytes / 1024 / 1024).toFixed(2),
      duration_ms: index.stats.index_duration_ms,
      partial: isPartial,
    });
  } catch (error) {
    // Let caller handle error logging
    throw error;
  }
}
