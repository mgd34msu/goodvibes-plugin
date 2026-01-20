/**
 * Grep With Content Handler
 *
 * Search with configurable context output.
 * Provides grep-like functionality with various verbosity levels.
 *
 * @module handlers/batch/grep-with-content
 */

import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/** Output mode for controlling response verbosity */
export type OutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

/**
 * Line range specification for filtering search scope.
 */
export interface LineRange {
  /** Only search from this line (1-based) */
  start?: number;
  /** Only search up to this line (1-based, inclusive) */
  end?: number;
}

/**
 * Arguments for the grep_with_content tool.
 */
export interface GrepWithContentArgs {
  /** Regex pattern to search for */
  pattern: string;
  /** Specific paths to search in (optional) */
  paths?: string[];
  /** Glob pattern to filter files (optional) */
  glob?: string;
  /** Output verbosity (default: standard) */
  output_mode?: OutputMode;
  /** Maximum number of matches to return (default: 100) */
  max_matches?: number;
  /** Case insensitive search (default: false) */
  case_insensitive?: boolean;
  /** Lines of context before match (default: based on output_mode) */
  context_before?: number;
  /** Lines of context after match (default: same as context_before if not specified) */
  context_after?: number;
  /** Line range to restrict search scope (only search within this range) */
  line_range?: LineRange;
}

/**
 * A single match result.
 */
interface MatchResult {
  /** File path (relative to project root) */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column?: number;
  /** Matching line content */
  content?: string;
  /** Context lines before the match */
  before?: string[];
  /** Context lines after the match */
  after?: string[];
}

/**
 * Result of the grep_with_content tool.
 */
interface GrepResult {
  /** Matching results */
  matches?: MatchResult[] | string[];
  /** Total number of matches */
  match_count: number;
  /** Number of files with matches */
  file_count: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** The search pattern used */
  pattern: string;
  /** Line range that was searched (only present if line_range was specified) */
  searched_range?: LineRange;
  /** Context lines used (before, after) */
  context?: { before: number; after: number };
}

/** MCP tool response format */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum matches to return */
const DEFAULT_MAX_MATCHES = 100;

/** Maximum allowed matches */
const MAX_ALLOWED_MATCHES = 500;

/** Context lines for standard mode */
const STANDARD_CONTEXT = 1;

/** Context lines for verbose mode */
const VERBOSE_CONTEXT = 3;

/** File extensions to search */
const SEARCHABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.md', '.mdx',
  '.css', '.scss', '.less', '.html', '.vue', '.svelte',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.prisma',
  '.env', '.env.local', '.env.example',
  '.gitignore', '.dockerignore', '.eslintrc', '.prettierrc',
];

/** Directories to always ignore */
const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  '__pycache__',
  '.pytest_cache',
];

/** Maximum file size to search (1MB) */
const MAX_FILE_SIZE = 1024 * 1024;

// =============================================================================
// Glob Pattern Matching
// =============================================================================

/**
 * Convert a simple glob pattern to regex.
 */
function simpleGlobToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$');
}

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Find all searchable files in the project.
 */
function findSearchableFiles(
  dir: string,
  globPattern?: RegExp,
  specificPaths?: string[]
): string[] {
  // If specific paths are provided, use those
  if (specificPaths && specificPaths.length > 0) {
    return specificPaths
      .map(p => path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p))
      .filter(p => {
        try {
          const stats = fs.statSync(p);
          return stats.isFile() && stats.size <= MAX_FILE_SIZE;
        } catch {
          return false;
        }
      });
  }

  const files: string[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip ignored directories
        if (IGNORE_DIRS.includes(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const relativePath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');

        // Check extension
        if (!SEARCHABLE_EXTENSIONS.includes(ext) && !entry.name.startsWith('.')) {
          continue;
        }

        // Check glob pattern if provided
        if (globPattern && !globPattern.test(relativePath)) {
          continue;
        }

        // Check file size
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size <= MAX_FILE_SIZE) {
            files.push(fullPath);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  walk(dir);
  return files;
}

// =============================================================================
// Search Implementation
// =============================================================================

/**
 * Search options for a single file.
 */
interface SearchOptions {
  /** Lines of context before the match */
  contextBefore: number;
  /** Lines of context after the match */
  contextAfter: number;
  /** Line range to restrict search (1-based, inclusive) */
  lineRange?: LineRange;
}

/**
 * Search a single file for pattern matches.
 *
 * @param filePath - Absolute path to the file
 * @param pattern - Regex pattern to search for
 * @param options - Search options including context and line range
 * @returns Array of match results
 */
function searchFile(
  filePath: string,
  pattern: RegExp,
  options: SearchOptions
): MatchResult[] {
  const results: MatchResult[] = [];
  const { contextBefore, contextAfter, lineRange } = options;

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return results;
  }

  const lines = content.split('\n');
  const relativePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  // Determine search bounds (convert 1-based to 0-based)
  const searchStart = lineRange?.start ? Math.max(0, lineRange.start - 1) : 0;
  const searchEnd = lineRange?.end ? Math.min(lines.length - 1, lineRange.end - 1) : lines.length - 1;

  // Search only within the specified line range
  for (let i = searchStart; i <= searchEnd; i++) {
    const line = lines[i];
    const match = pattern.exec(line);

    if (match) {
      const result: MatchResult = {
        file: relativePath,
        line: i + 1, // 1-based
        column: match.index + 1, // 1-based
        content: line,
      };

      // Add context lines if requested (asymmetric support)
      if (contextBefore > 0 || contextAfter > 0) {
        // Context can extend beyond the search range
        const beforeStart = Math.max(0, i - contextBefore);
        const afterEnd = Math.min(lines.length - 1, i + contextAfter);

        if (contextBefore > 0) {
          result.before = lines.slice(beforeStart, i);
        }
        if (contextAfter > 0) {
          result.after = lines.slice(i + 1, afterEnd + 1);
        }
      }

      results.push(result);

      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
    }
  }

  return results;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle grep_with_content MCP tool call.
 *
 * Searches for a pattern across files with configurable output.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with search results
 *
 * @example
 * ```typescript
 * const result = await handleGrepWithContent({
 *   pattern: 'export function',
 *   glob: '**\/*.ts',
 *   output_mode: 'standard',
 *   max_matches: 50
 * });
 * ```
 */
export async function handleGrepWithContent(
  args: GrepWithContentArgs
): Promise<ToolResponse> {
  // Validate input
  if (!args.pattern) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'No pattern provided' }, null, 2),
        },
      ],
      isError: true,
    };
  }

  // Parse pattern as regex
  let searchPattern: RegExp;
  try {
    const flags = args.case_insensitive ? 'gi' : 'g';
    searchPattern = new RegExp(args.pattern, flags);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `Invalid regex pattern: ${err instanceof Error ? err.message : 'Unknown error'}`,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  const outputMode = args.output_mode ?? 'standard';
  const maxMatches = Math.min(
    Math.max(1, args.max_matches ?? DEFAULT_MAX_MATCHES),
    MAX_ALLOWED_MATCHES
  );

  // Convert glob to regex if provided
  const globPattern = args.glob ? simpleGlobToRegex(args.glob) : undefined;

  // Find searchable files
  const files = findSearchableFiles(PROJECT_ROOT, globPattern, args.paths);

  // Search files for matches
  const allMatches: MatchResult[] = [];
  const filesWithMatches = new Set<string>();

  // Determine context lines based on output mode and explicit parameters
  // Priority: explicit context_before/context_after > output_mode defaults
  const defaultContextLines =
    outputMode === 'verbose' ? VERBOSE_CONTEXT :
    outputMode === 'standard' ? STANDARD_CONTEXT :
    0;

  // If context_before is explicitly specified, use it; otherwise use mode default
  const contextBefore = args.context_before !== undefined
    ? Math.max(0, args.context_before)
    : defaultContextLines;

  // If context_after is explicitly specified, use it
  // Otherwise, if context_before is specified, default to same value
  // Otherwise, use mode default
  const contextAfter = args.context_after !== undefined
    ? Math.max(0, args.context_after)
    : args.context_before !== undefined
      ? contextBefore
      : defaultContextLines;

  // Build search options
  const searchOptions: SearchOptions = {
    contextBefore,
    contextAfter,
    lineRange: args.line_range,
  };

  for (const file of files) {
    if (allMatches.length >= maxMatches) break;

    const fileMatches = searchFile(file, searchPattern, searchOptions);

    for (const match of fileMatches) {
      if (allMatches.length >= maxMatches) break;
      allMatches.push(match);
      filesWithMatches.add(match.file);
    }
  }

  const truncated = allMatches.length >= maxMatches;

  // Build common result metadata
  const baseResult: Omit<GrepResult, 'matches'> = {
    match_count: allMatches.length,
    file_count: filesWithMatches.size,
    truncated,
    pattern: args.pattern,
    // Include searched_range only if line_range was specified
    ...(args.line_range && { searched_range: args.line_range }),
    // Include context info for standard/verbose modes or when explicitly specified
    ...((outputMode === 'standard' || outputMode === 'verbose' ||
         args.context_before !== undefined || args.context_after !== undefined) && {
      context: { before: contextBefore, after: contextAfter },
    }),
  };

  // Format result based on output mode
  if (outputMode === 'count_only') {
    const result: GrepResult = baseResult;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  if (outputMode === 'minimal') {
    // Just file:line pairs
    const matches = allMatches.map(m => `${m.file}:${m.line}`);
    const result: GrepResult = {
      ...baseResult,
      matches,
    };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // Standard and verbose modes include full match objects
  // (verbose has more context lines, which is already handled above)
  const result: GrepResult = {
    ...baseResult,
    matches: allMatches,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
