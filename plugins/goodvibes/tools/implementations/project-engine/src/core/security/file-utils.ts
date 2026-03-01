/**
 * Security scanning file utilities
 *
 * Deduplicated file-checking functions shared across the secrets
 * scanner and permissions checker.
 *
 * @module core/security/file-utils
 */

import * as node_path from 'node:path';
import { SECURITY_SKIP_PATTERNS, SCANNABLE_EXTENSIONS, SOURCE_CODE_EXTENSIONS } from './constants.js';

/**
 * Check if a file path should be skipped during security scanning.
 *
 * Matches against directory names, filename patterns (*.min.js),
 * and specific filenames (package-lock.json).
 *
 * @param filePath - Absolute or relative file path to check
 * @returns true if the file should be skipped
 *
 * @example
 * shouldSkip('/project/node_modules/pkg/index.js') // true
 * shouldSkip('/project/src/config.ts') // false
 */
export function shouldSkip(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return SECURITY_SKIP_PATTERNS.some(pattern => {
    if (pattern.startsWith('*.')) {
      return normalizedPath.endsWith(pattern.substring(1));
    }
    return normalizedPath.includes(`/${pattern}/`) || normalizedPath.includes(`/${pattern}`);
  });
}

/**
 * Check if a file has a scannable extension for secrets detection.
 *
 * Always returns true for .env files regardless of extension.
 *
 * @param filePath - File path to check
 * @returns true if the file should be scanned for secrets
 *
 * @example
 * isScannable('/project/.env.local') // true (always)
 * isScannable('/project/src/app.ts') // true
 * isScannable('/project/dist/bundle.js') // false (filtered by shouldSkip)
 */
export function isScannable(filePath: string): boolean {
  const ext = node_path.extname(filePath).toLowerCase();
  const basename = node_path.basename(filePath);

  // Always scan .env files regardless of extension
  if (basename.startsWith('.env')) {
    return true;
  }

  return SCANNABLE_EXTENSIONS.includes(ext);
}

/**
 * Check if a file has a source-code extension (for permission scanning).
 *
 * Narrower than isScannable — only TypeScript and JavaScript files.
 *
 * @param filePath - File path to check
 * @returns true if the file is a TypeScript/JavaScript source file
 *
 * @example
 * isSourceFile('/project/src/handler.ts') // true
 * isSourceFile('/project/.env') // false
 */
export function isSourceFile(filePath: string): boolean {
  const ext = node_path.extname(filePath).toLowerCase();
  return SOURCE_CODE_EXTENSIONS.includes(ext);
}
