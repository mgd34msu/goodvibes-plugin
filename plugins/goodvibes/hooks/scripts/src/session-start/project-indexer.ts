/**
 * Project File Indexer
 *
 * Builds an initial file index at session start for efficient file system operations.
 * Uses Node.js built-in fs.readdir with recursive option (Node 20+) to avoid dependencies.
 *
 * The index is written to .goodvibes/project-index.json and used by precision-engine
 * tools for fast file lookups without hitting the filesystem repeatedly.
 */

import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises';
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
 * Project file index structure (version 2).
 * Must match the format expected by precision-engine's ProjectIndex class.
 */
interface ProjectFileIndex {
  version: 2;
  created_at: string;
  updated_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_dirs: number;
    index_duration_ms: number;
    partial?: boolean;
  };
  tree: Record<string, string[]>;
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
 * Cache for compiled glob regexes to avoid recompilation.
 * Single-segment patterns store RegExp directly.
 * Double-star patterns use 'dstar:' prefix key and store [fullMatch, prefixMatch] tuples (cast via unknown).
 */
const globRegexCache = new Map<string, RegExp>();

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
  // Check cache first
  let regex = globRegexCache.get(pattern);
  if (!regex) {
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
    regex = new RegExp(`^${regexStr}$`);
    globRegexCache.set(pattern, regex);
  }
  return regex.test(name);
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
      if (p.raw.includes('**')) {
        // Simple ** handling: convert to regex (cached by p.raw)
        const cacheKey = `dstar:${p.raw}`;
        let cached = globRegexCache.get(cacheKey) as unknown as [RegExp, RegExp] | undefined;
        if (!cached) {
          const regexStr = p.raw
            .split('**')
            .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
            .join('.*');
          cached = [new RegExp(`^${regexStr}$`), new RegExp(`^${regexStr}(/.*)?$`)];
          globRegexCache.set(cacheKey, cached as unknown as RegExp);
        }
        matches = cached[0].test(relativePath) || cached[1].test(relativePath);
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
 * Build a lean project file index.
 *
 * Recursively scans the project directory, groups files by directory, and writes
 * a sorted tree index to .goodvibes/project-index.json.
 *
 * Excludes: test files (*.test.*, *.spec.*, __tests__/), generated files (*.d.ts, *.map),
 * media/binary files, lock files, IDE directories, and .gitignore'd paths.
 * This keeps the index lean for token-efficient context injection.
 *
 * @param projectDir - Absolute path to the project root
 */
export async function buildProjectIndex(projectDir: string): Promise<void> {
  const startMs = Date.now();
  // tree: directory path (relative, empty string = root) -> sorted filenames
  const tree: Record<string, string[]> = {};
  let isPartial = false;
  let totalFiles = 0;

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

      // Group files by directory
      const dirPart = path.dirname(relativePath);
      const treeKey = dirPart === '.' ? '' : dirPart.split(path.sep).join('/');
      const filename = entry.name;

      if (!tree[treeKey]) {
        tree[treeKey] = [];
      }
      tree[treeKey].push(filename);
      totalFiles++;
    }

    // Sort filenames within each directory for determinism
    for (const key of Object.keys(tree)) {
      tree[key].sort();
    }

    const totalDirs = Object.keys(tree).length;

    // Build index
    const index: ProjectFileIndex = {
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_root: projectDir,
      stats: {
        total_files: totalFiles,
        total_dirs: totalDirs,
        index_duration_ms: Date.now() - startMs,
        ...(isPartial && { partial: true }),
      },
      tree,
    };

    // Write atomically: temp file + rename
    const indexDir = path.join(projectDir, '.goodvibes');
    const indexPath = path.join(indexDir, 'project-index.json');
    const tempPath = indexPath + '.tmp';

    await mkdir(indexDir, { recursive: true });
    await writeFile(tempPath, JSON.stringify(index) + '\n', 'utf-8');
    await rename(tempPath, indexPath);

    debug('Project index created', {
      files: totalFiles,
      dirs: totalDirs,
      duration_ms: index.stats.index_duration_ms,
      partial: isPartial,
    });
  } catch (error) {
    // Let caller handle error logging
    throw error;
  }
}
