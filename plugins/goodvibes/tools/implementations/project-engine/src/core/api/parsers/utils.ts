/**
 * Shared utilities for API route parsers.
 *
 * Common helper functions used across Express, Fastify, Hono, and Next.js parsers.
 *
 * @module core/api/parsers/utils
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Recursively finds files matching a pattern in a directory (synchronous).
 *
 * @param dir - Directory to search
 * @param includePattern - RegExp pattern that file names must match
 * @param excludePattern - Optional RegExp pattern to exclude files
 * @returns Array of absolute file paths
 */
export function findFilesSync(dir: string, includePattern: RegExp, excludePattern?: RegExp): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (excludePattern && excludePattern.test(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'build', '.turbo'].includes(entry.name)) {
        continue;
      }
      files.push(...findFilesSync(fullPath, includePattern, excludePattern));
    } else if (entry.isFile() && includePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Converts a character index to a 1-based line number in source content.
 *
 * @param content - Full source file content
 * @param index - Character index position
 * @returns 1-based line number
 */
export function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}
