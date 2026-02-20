/**
 * Project File Indexer
 *
 * Builds a file index for efficient file system operations.
 * Uses Node.js built-in fs.readdir with recursive option (Node 20+) to avoid dependencies.
 *
 * The index is written to .goodvibes/project-index.json and used by precision-engine
 * tools for fast file lookups without hitting the filesystem repeatedly.
 *
 * This is the canonical implementation, shared by both the session-start hook and
 * the precision-engine MCP server (which can rebuild the index on demand).
 */

import { readdir, readFile, stat, writeFile, mkdir, rename } from 'fs/promises';
import path from 'path';
import { ProjectFileIndex, FORMAT_HINT } from './project-index.js';

/**
 * Logger interface for buildProjectIndex.
 * Decouples the indexer from any specific logging implementation so it can be
 * used in both the session-start hook and the MCP server contexts.
 */
export interface IndexerLogger {
  debug(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, err: unknown): void;
}

/**
 * Default logger: writes to stderr so output never pollutes MCP stdout.
 */
const defaultLogger: IndexerLogger = {
  debug(msg: string, data?: Record<string, unknown>): void {
    const suffix = data ? ' ' + JSON.stringify(data) : '';
    process.stderr.write(`[project-indexer] ${msg}${suffix}\n`);
  },
  error(msg: string, err: unknown): void {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[project-indexer] ERROR ${msg}: ${detail}\n`);
  },
};

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
 * Cache for compiled single-segment glob regexes to avoid recompilation.
 * Cleared at the start of each buildProjectIndex call to prevent unbounded growth.
 */
let globRegexCache = new Map<string, RegExp>();

/**
 * Cache for compiled double-star glob regexes to avoid recompilation.
 * Stores [fullMatch, prefixMatch] tuples for '**' patterns.
 * Cleared at the start of each buildProjectIndex call to prevent unbounded growth.
 */
let globDstarCache = new Map<string, [RegExp, RegExp]>();

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
    // For dirOnly patterns and files, check if file is inside a matching directory
    if (p.dirOnly && !isDir) {
      let parentMatch = false;
      for (let s = 0; s < segments.length - 1; s++) {
        const parentPath = segments.slice(0, s + 1).join('/');
        const parentName = segments[s];
        if (p.raw.includes('/')) {
          if (p.anchored) {
            parentMatch = matchGlob(p.raw, parentPath);
          } else {
            parentMatch = matchGlob(p.raw, parentPath) || parentPath === p.raw;
          }
        } else {
          parentMatch = matchGlob(p.raw, parentName);
        }
        if (parentMatch) break;
      }
      if (!parentMatch) continue;
      ignored = !p.negated;
      continue;
    }

    let matches = false;

    if (p.raw.includes('/')) {
      // Pattern with slash: match against full relative path
      if (p.raw.includes('**')) {
        // Simple ** handling: convert to regex (cached by p.raw)
        let cached = globDstarCache.get(p.raw);
        if (!cached) {
          const regexStr = p.raw
            .split('**')
            .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
            .join('.*');
          cached = [new RegExp(`^${regexStr}$`), new RegExp(`^${regexStr}(/.*)?$`)];
          globDstarCache.set(p.raw, cached);
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
 * The output uses the v4 tree format: each directory maps to an object of
 * filename -> token count (Math.ceil(fileSize / 4)).
 *
 * @param projectDir - Absolute path to the project root
 * @param logger - Optional logger; defaults to writing debug/error to stderr
 */
/**
 * Stat a list of file paths in parallel, processing them in chunks to stay within
 * file-descriptor limits. Bails out early if the 30-second indexing budget is exceeded.
 *
 * @param paths     - Absolute file paths to stat.
 * @param chunkSize - Number of concurrent stat calls per chunk (default: 64).
 * @param startMs   - Epoch milliseconds when the overall indexing run started, used for timeout.
 * @returns An object containing the byte sizes for each path (0 on error or timeout) and
 *          a `timedOut` flag that is `true` when the budget was exceeded before all paths
 *          were processed.
 */
async function batchStat(
  paths: string[],
  chunkSize = 64,
  startMs: number
): Promise<{ sizes: number[]; timedOut: boolean }> {
  const sizes: number[] = [];
  let timedOut = false;
  for (let i = 0; i < paths.length; i += chunkSize) {
    // Check timeout between chunks
    if (Date.now() - startMs > 30000) {
      timedOut = true;
      // Fill remaining with 0
      for (let j = i; j < paths.length; j++) sizes.push(0);
      break;
    }
    const chunk = paths.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (p) => {
        try {
          return (await stat(p)).size;
        } catch {
          return 0;
        }
      })
    );
    sizes.push(...results);
  }
  return { sizes, timedOut };
}

export async function buildProjectIndex(
  projectDir: string,
  logger: IndexerLogger = defaultLogger
): Promise<void> {
  // Clear glob regex caches to prevent unbounded memory growth across calls
  globRegexCache = new Map();
  globDstarCache = new Map();

  const startMs = Date.now();
  // tree: directory path (relative, empty string = root) -> { filename: tokenCount }
  const tree: Record<string, Record<string, number>> = {};
  let isPartial = false;
  let totalFiles = 0;

  try {
    logger.debug('Building project file index', { projectDir });

    // Load .gitignore patterns
    const gitignorePatterns = await loadGitignore(projectDir);
    logger.debug('Loaded gitignore patterns', { count: gitignorePatterns.length });

    // Use Node.js built-in recursive readdir (Node 20+)
    const dirEntries = await readdir(projectDir, {
      recursive: true,
      withFileTypes: true,
    });

    // First pass: filter entries and collect metadata (no I/O)
    const fileEntries: { fullPath: string; treeKey: string; filename: string }[] = [];
    for (const entry of dirEntries) {
      // Check timeout (30 seconds max)
      if (Date.now() - startMs > 30000) {
        logger.debug('Project indexing timeout - writing partial index');
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

      // Group files by directory with token estimates
      const dirPart = path.dirname(relativePath);
      const treeKey = dirPart === '.' ? '' : dirPart.split(path.sep).join('/');
      const filename = entry.name;
      const fullPath = path.join(parent, entry.name);

      fileEntries.push({ fullPath, treeKey, filename });
    }

    // Second pass: batch stat all files in parallel (chunked to stay within fd limits)
    const fullPaths = fileEntries.map((e) => e.fullPath);
    const { sizes, timedOut } = await batchStat(fullPaths, 64, startMs);
    if (timedOut) isPartial = true;

    // Third pass: build tree from results
    for (let i = 0; i < fileEntries.length; i++) {
      const { treeKey, filename } = fileEntries[i];
      const fileSize = sizes[i] ?? 0;
      if (!tree[treeKey]) {
        tree[treeKey] = {};
      }
      tree[treeKey][filename] = Math.ceil(fileSize / 4);
      totalFiles++;
    }

    // Sort file entries by name within each directory for determinism
    for (const key of Object.keys(tree)) {
      const sorted: Record<string, number> = {};
      for (const name of Object.keys(tree[key]).sort()) {
        sorted[name] = tree[key][name];
      }
      tree[key] = sorted;
    }

    const totalDirs = Object.keys(tree).length;

    // Build index
    const index: ProjectFileIndex = {
      _format: FORMAT_HINT,
      version: 4,
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

    logger.debug('Project index created', {
      files: totalFiles,
      dirs: totalDirs,
      duration_ms: index.stats.index_duration_ms,
      partial: isPartial,
    });
  } catch (error) {
    logger.error('Project indexing failed', error);
    throw error;
  }
}
