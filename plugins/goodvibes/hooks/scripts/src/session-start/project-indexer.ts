/**
 * Project File Indexer
 *
 * Builds an initial file index at session start for efficient file system operations.
 * Uses Node.js built-in fs.readdir with recursive option (Node 20+) to avoid dependencies.
 *
 * The index is written to .goodvibes/project-index.json and used by precision-engine
 * tools for fast file lookups without hitting the filesystem repeatedly.
 */

import { readdir, readFile, stat, writeFile, mkdir, rename } from 'fs/promises';
import path from 'path';
import { debug, logError } from '../shared/index.js';

/**
 * Directories to exclude from the index.
 * These are typically build artifacts, dependencies, and cache directories.
 */
const INDEX_EXCLUSION_DIRS = new Set([
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
  // Test directories
  '__tests__',
  '__mocks__',
  '__fixtures__',
  '__snapshots__',
  // IDE/editor
  '.vscode',
  '.idea',
]);

/**
 * File suffixes/extensions to exclude (typically generated, compiled, or binary).
 * Order matters for multi-part extensions — check longest first.
 */
const EXCLUDED_SUFFIXES = [
  // Multi-part extensions (check before single-part)
  '.test.ts',
  '.spec.ts',
  '.test.tsx',
  '.spec.tsx',
  '.test.js',
  '.spec.js',
  '.test.jsx',
  '.spec.jsx',
  '.d.ts',
  '.d.mts',
  '.d.cts',
  '.stories.ts',
  '.stories.tsx',
  '.stories.js',
  '.stories.jsx',
  '.stories.mdx',
  '.min.js',
  '.min.css',
  '.tsbuildinfo',
  // Single-part extensions
  '.map',
  // Media/binary
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.mp4',
  '.mp3',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
];

/**
 * Specific filenames to exclude (lock files, OS artifacts).
 */
const EXCLUDED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.DS_Store',
  'Thumbs.db',
]);

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
 * A parsed .gitignore pattern entry.
 */
interface GitignorePattern {
  /** Whether this is a negation pattern (!) */
  negated: boolean;
  /** Whether the pattern is anchored to the root (starts with /) */
  anchored: boolean;
  /** Whether the pattern matches only directories (ends with /) */
  dirOnly: boolean;
  /** The raw pattern string (normalized) */
  raw: string;
}

/**
 * Parse a .gitignore file into pattern entries.
 * Ignores comment lines and blank lines.
 *
 * @param content - Raw .gitignore file content
 * @returns Array of parsed pattern entries
 */
function parseGitignore(content: string): GitignorePattern[] {
  const patterns: GitignorePattern[] = [];
  for (const line of content.split('\n')) {
    let raw = line;
    // Strip trailing spaces (not escaped ones)
    raw = raw.replace(/(?<!\\) +$/, '');
    // Skip empty lines and comments
    if (!raw || raw.startsWith('#')) continue;

    const negated = raw.startsWith('!');
    if (negated) raw = raw.slice(1);

    // A backslash before a # is a literal #
    if (raw.startsWith('\\#')) raw = raw.slice(1);

    const anchored = raw.startsWith('/');
    if (anchored) raw = raw.slice(1);

    const dirOnly = raw.endsWith('/');
    if (dirOnly) raw = raw.slice(0, -1);

    if (!raw) continue;

    patterns.push({ negated, anchored, dirOnly, raw });
  }
  return patterns;
}

/**
 * Test whether a path component matches a gitignore pattern segment.
 * Supports * and ? wildcards but not **.
 *
 * @param pattern - Single pattern segment
 * @param name - File/directory name to test
 * @returns true if the name matches
 */
function matchGlob(pattern: string, name: string): boolean {
  // Convert glob pattern to regex
  let regexStr = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      regexStr += '[^/]*';
    } else if (ch === '?') {
      regexStr += '[^/]';
    } else {
      // Escape regex special chars
      regexStr += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${regexStr}$`).test(name);
}

/**
 * Check if a relative path matches any gitignore pattern.
 *
 * @param patterns - Parsed gitignore patterns
 * @param relativePath - Path relative to project root (forward slashes)
 * @param isDir - Whether the path is a directory
 * @returns true if the path is ignored
 */
function isGitignored(
  patterns: GitignorePattern[],
  relativePath: string,
  isDir: boolean
): boolean {
  const segments = relativePath.split('/');
  const name = segments[segments.length - 1];
  let ignored = false;

  for (const p of patterns) {
    // Skip dir-only patterns for files
    if (p.dirOnly && !isDir) continue;

    let matches = false;

    if (p.raw.includes('/')) {
      // Pattern with slash: match against full relative path
      // Use ** for double-star patterns
      const patternWithDoublestar = p.raw.replace(/\*\*/g, '**');
      if (patternWithDoublestar.includes('**')) {
        // Simple ** handling: convert to regex
        const regexStr = patternWithDoublestar
          .split('**')
          .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
          .join('.*');
        matches = new RegExp(`^${regexStr}$`).test(relativePath) ||
                  new RegExp(`^${regexStr}(/.*)?$`).test(relativePath);
      } else if (p.anchored) {
        // Anchored to root
        matches = matchGlob(p.raw, relativePath) ||
                  relativePath.startsWith(p.raw + '/');
      } else {
        // Match at any depth
        matches = matchGlob(p.raw, relativePath) ||
                  relativePath === p.raw ||
                  relativePath.startsWith(p.raw + '/');
      }
    } else {
      // No slash: match against filename (basename) only
      matches = matchGlob(p.raw, name);
      // Also check if any parent segment matches (for directory-only patterns or name matches)
      if (!matches && isDir) {
        // For directories, check if this dir name matches at any level
        for (const seg of segments) {
          if (matchGlob(p.raw, seg)) {
            matches = true;
            break;
          }
        }
      }
    }

    if (matches) {
      ignored = !p.negated;
    }
  }

  return ignored;
}

/**
 * Load and parse .gitignore from the project root.
 * Returns empty array if .gitignore doesn't exist.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Parsed gitignore patterns
 */
async function loadGitignore(projectDir: string): Promise<GitignorePattern[]> {
  try {
    const gitignorePath = path.join(projectDir, '.gitignore');
    const content = await readFile(gitignorePath, 'utf-8');
    return parseGitignore(content);
  } catch {
    // No .gitignore found or unreadable
    return [];
  }
}

/**
 * Check if a file or directory should be excluded from the index.
 *
 * @param name - File or directory name
 * @param relativePath - Path relative to project root (uses platform separators)
 * @param gitignorePatterns - Parsed .gitignore patterns
 * @param isDir - Whether this entry is a directory
 * @returns true if the file/directory should be excluded
 */
function shouldExclude(
  name: string,
  relativePath: string,
  gitignorePatterns: GitignorePattern[],
  isDir: boolean
): boolean {
  // Check if any path segment matches the exclusion dir list
  const segments = relativePath.split(path.sep);
  for (const segment of segments) {
    if (INDEX_EXCLUSION_DIRS.has(segment)) {
      return true;
    }
  }

  // For files only: check excluded filenames and suffixes
  if (!isDir) {
    if (EXCLUDED_FILENAMES.has(name)) {
      return true;
    }

    // Check excluded suffixes (multi-part first, then single-part)
    const lowerName = name.toLowerCase();
    for (const suffix of EXCLUDED_SUFFIXES) {
      if (lowerName.endsWith(suffix)) {
        return true;
      }
    }
  }

  // Check .gitignore patterns
  if (gitignorePatterns.length > 0) {
    // Normalize to forward slashes for gitignore matching
    const normalizedPath = relativePath.split(path.sep).join('/');
    if (isGitignored(gitignorePatterns, normalizedPath, isDir)) {
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

    // Load .gitignore patterns
    const gitignorePatterns = await loadGitignore(projectDir);
    debug('Loaded gitignore patterns', { count: gitignorePatterns.length });

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

      // Build relative path with Node 20.0-20.11 compatibility
      const parent = entry.parentPath ?? (entry as any).path;
      const relativePath = parent
        ? path.relative(projectDir, path.join(parent, entry.name))
        : entry.name;

      const isDir = entry.isDirectory();

      // Check if should be excluded (dirs and files)
      if (shouldExclude(entry.name, relativePath, gitignorePatterns, isDir)) {
        continue;
      }

      // Skip non-files after exclusion check
      if (!entry.isFile()) {
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
