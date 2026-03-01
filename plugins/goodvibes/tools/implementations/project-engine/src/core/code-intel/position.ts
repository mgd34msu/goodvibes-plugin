/**
 * Position Conversion Utilities
 *
 * Extracted from LanguageServiceManagerImpl methods.
 * Converts between line/column and byte offsets in TypeScript source files.
 *
 * @module core/code-intel/position
 */

import type ts from 'typescript';

/**
 * Convert 1-based line/column to byte offset in a source file.
 *
 * @param sourceFile - The TypeScript source file
 * @param line - 1-based line number
 * @param column - 1-based column number
 * @returns Byte offset position
 */
export function toOffset(sourceFile: ts.SourceFile, line: number, column: number): number {
  // Convert from 1-based to 0-based
  const zeroBasedLine = Math.max(0, line - 1);
  const zeroBasedColumn = Math.max(0, column - 1);
  return sourceFile.getPositionOfLineAndCharacter(zeroBasedLine, zeroBasedColumn);
}

/**
 * Convert byte offset to 1-based line/column in a source file.
 *
 * @param sourceFile - The TypeScript source file
 * @param position - Byte offset
 * @returns Object with 1-based line and column numbers
 */
export function toLineColumn(
  sourceFile: ts.SourceFile,
  position: number
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  // Convert from 0-based to 1-based
  return {
    line: line + 1,
    column: character + 1,
  };
}
