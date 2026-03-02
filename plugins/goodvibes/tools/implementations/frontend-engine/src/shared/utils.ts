/**
 * Shared path utility functions for frontend-engine.
 *
 * Pure infrastructure utilities — zero domain knowledge.
 * Used across multiple handlers for consistent path handling.
 *
 * @module shared/utils
 */

import * as path from 'node:path';
import ts from 'typescript';

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Normalize a file path to use forward slashes.
 *
 * @param filePath - The file path to normalize
 * @returns Path with all backslashes replaced by forward slashes
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Make an absolute path relative to a project root, normalized to forward slashes.
 *
 * @param absPath - The absolute file path
 * @param root - The project root directory
 * @returns Relative path with forward slashes
 */
export function makeRelativePath(absPath: string, root: string): string {
  return normalizeFilePath(path.relative(root, absPath));
}

/**
 * Get the 1-based line number for a position within a TypeScript SourceFile.
 *
 * @param pos - The character offset within the source file
 * @param sourceFile - The TypeScript SourceFile object
 * @returns 1-based line number containing the given position
 */
export function getLineNumberFromSourceFile(pos: number, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return line + 1;
}
