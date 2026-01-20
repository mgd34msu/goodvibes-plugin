/**
 * TODO scanning functionality
 *
 * NOTE: Some TODO scanning logic is duplicated from hooks/scripts/src/context/todo-scanner.ts
 * This is intentional - the MCP server and hooks are separate npm packages with different
 * compilation targets. A shared module would require significant restructuring.
 * If you fix bugs here, also fix them in todo-scanner.ts!
 */

import * as fs from 'fs';
import * as path from 'path';

import { TodoItem } from './types.js';
import {
  SCAN_EXTENSIONS,
  SKIP_DIRS,
  TEST_FILE_PATTERNS,
  TODO_PATTERN,
} from './constants.js';
import { logError } from '../../logging.js';

/**
 * Checks if a filename matches common test file patterns.
 *
 * Matches patterns like *.test.ts, *.spec.js, __tests__/*.ts, etc.
 *
 * @param filename - The filename to check (not full path)
 * @returns True if the filename matches a test file pattern
 *
 * @example
 * ```typescript
 * isTestFile('user.test.ts');    // true
 * isTestFile('user.spec.js');    // true
 * isTestFile('user.service.ts'); // false
 * ```
 */
export function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Determines the priority level of a TODO comment based on its type and content.
 *
 * Priority rules:
 * - High: FIXME, BUG, or text containing 'urgent', 'critical', 'security'
 * - Low: NOTE, or text containing 'maybe', 'consider', 'nice to have'
 * - Medium: All other cases (default)
 *
 * @param type - The TODO marker type (TODO, FIXME, BUG, NOTE, HACK)
 * @param text - The text content following the marker
 * @returns Priority level: 'high', 'medium', or 'low'
 *
 * @example
 * ```typescript
 * getPriority('FIXME', 'broken login');     // 'high'
 * getPriority('TODO', 'security issue');    // 'high'
 * getPriority('NOTE', 'for future ref');    // 'low'
 * getPriority('TODO', 'add validation');    // 'medium'
 * ```
 */
export function getPriority(type: string, text: string): 'high' | 'medium' | 'low' {
  const upperType = type.toUpperCase();
  const lowerText = text.toLowerCase();

  if (upperType === 'FIXME' || upperType === 'BUG') return 'high';
  if (lowerText.includes('urgent') || lowerText.includes('critical') || lowerText.includes('important')) {
    return 'high';
  }
  if (lowerText.includes('security') || lowerText.includes('vulnerability')) return 'high';

  if (upperType === 'NOTE') return 'low';
  if (lowerText.includes('maybe') || lowerText.includes('consider') || lowerText.includes('nice to have')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Scans a single file for TODO/FIXME/BUG/NOTE/HACK comments.
 *
 * Parses each line looking for TODO patterns and extracts type, text, and location.
 * Skips very short comments (< 3 chars) to avoid false positives.
 *
 * @param filePath - Absolute path to the file to scan
 * @param relativePath - Relative path for reporting (displayed in results)
 * @returns Array of TodoItem objects found in the file
 *
 * @example
 * ```typescript
 * const todos = scanFile('/project/src/app.ts', 'src/app.ts');
 * // Returns: [{ type: 'TODO', text: 'Add error handling', file: 'src/app.ts', line: 42, priority: 'medium' }]
 * ```
 */
export function scanFile(filePath: string, relativePath: string): TodoItem[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const items: TodoItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      TODO_PATTERN.lastIndex = 0;
      let match;

      while ((match = TODO_PATTERN.exec(line)) !== null) {
        const type = match[1].toUpperCase() as TodoItem['type'];
        const text = match[2].trim();

        if (text.length < 3) continue;

        items.push({
          type,
          text: text.slice(0, 100),
          file: relativePath,
          line: i + 1,
          priority: getPriority(type, text),
        });
      }
    }

    return items;
  } catch (err: unknown) {
    // Log but continue - file may be unreadable or deleted during scan
    logError(`[issues] Failed to scan file ${filePath}`, err);
    return [];
  }
}

/**
 * Recursively scans a directory for TODO comments in source files.
 *
 * Skips common non-source directories (node_modules, .git, dist, etc.) and test files.
 * Respects the maxFiles limit to prevent excessive scanning in large codebases.
 *
 * @param dir - Absolute path to the directory to scan
 * @param baseDir - Base directory for computing relative paths
 * @param items - Array to accumulate found TodoItem objects (mutated in place)
 * @param maxFiles - Maximum number of files to scan (default: 500)
 *
 * @example
 * ```typescript
 * const items: TodoItem[] = [];
 * scanDirectory('/project/src', '/project', items, 100);
 * // items now contains all TODOs found in /project/src
 * ```
 */
export function scanDirectory(dir: string, baseDir: string, items: TodoItem[], maxFiles: number = 500): void {
  if (items.length >= maxFiles * 10) return;

  let filesScanned = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (filesScanned >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          scanDirectory(fullPath, baseDir, items, maxFiles - filesScanned);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCAN_EXTENSIONS.has(ext) && !isTestFile(entry.name)) {
          filesScanned++;
          const fileItems = scanFile(fullPath, relativePath);
          items.push(...fileItems);
        }
      }
    }
  } catch (err: unknown) {
    // Log but continue - directory may be inaccessible
    logError(`[issues] Failed to read directory ${dir}`, err);
  }
}
