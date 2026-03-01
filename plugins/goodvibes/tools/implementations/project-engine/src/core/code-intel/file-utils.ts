/**
 * File Utility Functions for Code Intelligence
 *
 * Deduplicated from dead-code.ts, api-surface.ts, and circular.ts.
 * Provides async file discovery utilities for source code analysis.
 *
 * @module core/code-intel/file-utils
 */

import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';

import { SOURCE_EXTENSIONS, SKIP_DIRECTORIES } from '../../shared/constants.js';
import { TEST_PATTERNS } from './constants.js';

/**
 * Check if a file is a test file based on its path.
 *
 * @param filePath - The file path to check
 * @returns True if the file matches any test pattern
 */
export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return TEST_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if a file is a TypeScript/JavaScript source file.
 * Uses SOURCE_EXTENSIONS from shared/constants.
 *
 * @param filePath - The file path to check
 * @returns True if the file has a recognized source extension
 */
export function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return (SOURCE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Recursively find all source files in a directory.
 * Skips node_modules, hidden directories, and build outputs.
 *
 * @param dirPath - The directory to search
 * @returns Array of absolute file paths
 */
export async function findSourceFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await node_fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Ignore directories we can't read
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (
          (SKIP_DIRECTORIES as readonly string[]).includes(entry.name) ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return files;
}
