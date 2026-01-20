/**
 * Smart Glob Handler
 *
 * Glob with intelligent filtering and output control.
 * Supports multiple patterns, exclusions, and various output modes.
 *
 * @module handlers/batch/smart-glob
 */

import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/** Output mode for controlling response verbosity */
export type OutputMode = 'count_only' | 'minimal' | 'standard';

/**
 * Arguments for the smart_glob tool.
 */
export interface SmartGlobArgs {
  /** Array of glob patterns to match */
  patterns: string[];
  /** Patterns to exclude (optional) */
  exclude?: string[];
  /** Output verbosity (default: standard) */
  output_mode?: OutputMode;
  /** Maximum number of files to return (default: 100) */
  limit?: number;
}

/**
 * File info for standard output mode.
 */
interface FileInfo {
  /** File path (relative to project root) */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (ISO string) */
  modified: string;
}

/**
 * Result of the smart_glob tool.
 */
interface SmartGlobResult {
  /** Files matching the patterns (depends on output_mode) */
  files?: string[] | FileInfo[];
  /** Total count of matching files */
  count: number;
  /** Whether results were truncated due to limit */
  truncated: boolean;
  /** Patterns that were matched */
  patterns: string[];
  /** Patterns that were excluded */
  excluded?: string[];
}

/** MCP tool response format */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum files to return */
const DEFAULT_LIMIT = 100;

/** Maximum allowed limit */
const MAX_LIMIT = 1000;

/** Directories to always ignore */
const ALWAYS_IGNORE = [
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
  'target', // Rust
  'vendor', // Go
];

// =============================================================================
// Glob Implementation
// =============================================================================

/**
 * Convert a glob pattern to a regex.
 * Supports:
 * - * matches any characters except /
 * - ** matches any characters including /
 * - ? matches single character
 * - [abc] character class
 * - {a,b} alternation
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path
        if (pattern[i + 2] === '/') {
          regex += '(?:.*/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        // * matches any characters except /
        regex += '[^/]*';
        i++;
      }
    } else if (char === '?') {
      regex += '[^/]';
      i++;
    } else if (char === '[') {
      // Character class
      const endBracket = pattern.indexOf(']', i);
      if (endBracket === -1) {
        regex += '\\[';
        i++;
      } else {
        regex += pattern.slice(i, endBracket + 1);
        i = endBracket + 1;
      }
    } else if (char === '{') {
      // Alternation
      const endBrace = pattern.indexOf('}', i);
      if (endBrace === -1) {
        regex += '\\{';
        i++;
      } else {
        const options = pattern.slice(i + 1, endBrace).split(',');
        regex += '(?:' + options.map(o => escapeRegex(o)).join('|') + ')';
        i = endBrace + 1;
      }
    } else if ('.+^$|\\()'.includes(char)) {
      // Escape regex special characters
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp('^' + regex + '$');
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a path matches any of the patterns.
 */
function matchesAnyPattern(relativePath: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(relativePath));
}

/**
 * Recursively find files matching the patterns.
 */
function findFiles(
  dir: string,
  patterns: RegExp[],
  excludePatterns: RegExp[],
  results: string[],
  limit: number,
  rootDir: string
): void {
  if (results.length >= limit) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Skip directories we can't read
  }

  for (const entry of entries) {
    if (results.length >= limit) break;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    // Skip always-ignored directories
    if (entry.isDirectory() && ALWAYS_IGNORE.includes(entry.name)) {
      continue;
    }

    // Skip hidden files/directories (except those explicitly matched)
    if (entry.name.startsWith('.') && !patterns.some(p => p.source.includes('\\.'))) {
      continue;
    }

    // Check exclusion patterns
    if (matchesAnyPattern(relativePath, excludePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Recurse into subdirectory
      findFiles(fullPath, patterns, excludePatterns, results, limit, rootDir);
    } else if (entry.isFile()) {
      // Check if file matches any pattern
      if (matchesAnyPattern(relativePath, patterns)) {
        results.push(relativePath);
      }
    }
  }
}

/**
 * Get file info (size and modification time).
 */
function getFileInfo(relativePath: string): FileInfo | null {
  const absolutePath = path.resolve(PROJECT_ROOT, relativePath);
  try {
    const stats = fs.statSync(absolutePath);
    return {
      path: relativePath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle smart_glob MCP tool call.
 *
 * Finds files matching glob patterns with intelligent filtering.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with matching files
 *
 * @example
 * ```typescript
 * const result = await handleSmartGlob({
 *   patterns: ['**\/*.ts', '**\/*.tsx'],
 *   exclude: ['**\/*.test.ts'],
 *   output_mode: 'standard',
 *   limit: 50
 * });
 * ```
 */
export async function handleSmartGlob(
  args: SmartGlobArgs
): Promise<ToolResponse> {
  // Validate input
  if (!args.patterns || args.patterns.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'No patterns provided' }, null, 2),
        },
      ],
      isError: true,
    };
  }

  const outputMode = args.output_mode ?? 'standard';
  const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  // Convert patterns to regexes
  const patterns = args.patterns.map(globToRegex);
  const excludePatterns = (args.exclude ?? []).map(globToRegex);

  // Find matching files (request more than limit to determine truncation)
  const matchingFiles: string[] = [];
  findFiles(PROJECT_ROOT, patterns, excludePatterns, matchingFiles, limit + 1, PROJECT_ROOT);

  const truncated = matchingFiles.length > limit;
  const files = matchingFiles.slice(0, limit);

  // Format result based on output mode
  if (outputMode === 'count_only') {
    const result: SmartGlobResult = {
      count: truncated ? limit : files.length,
      truncated,
      patterns: args.patterns,
      excluded: args.exclude,
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

  if (outputMode === 'minimal') {
    const result: SmartGlobResult = {
      files,
      count: files.length,
      truncated,
      patterns: args.patterns,
      excluded: args.exclude,
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

  // Standard mode - include file info
  const fileInfos = files
    .map(getFileInfo)
    .filter((info): info is FileInfo => info !== null);

  const result: SmartGlobResult = {
    files: fileInfos,
    count: fileInfos.length,
    truncated,
    patterns: args.patterns,
    excluded: args.exclude,
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
