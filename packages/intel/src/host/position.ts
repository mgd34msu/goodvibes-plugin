/**
 * Position conversion helpers.
 *
 * Ported verbatim from project-engine `core/code-intel/position.ts`.
 * Converts between 1-based line/column and byte offsets in a source file.
 */

import type ts from 'typescript';

/**
 * Convert a 1-based line/column to a byte offset. Line/column are clamped to a
 * minimum of 0; an out-of-range position throws inside TypeScript, which the
 * caller catches.
 * @param sourceFile - the source file
 * @param line - 1-based line
 * @param column - 1-based column
 */
export function toOffset(sourceFile: ts.SourceFile, line: number, column: number): number {
  const zeroBasedLine = Math.max(0, line - 1);
  const zeroBasedColumn = Math.max(0, column - 1);
  return sourceFile.getPositionOfLineAndCharacter(zeroBasedLine, zeroBasedColumn);
}

/**
 * Convert a byte offset to a 1-based line/column.
 * @param sourceFile - the source file
 * @param position - byte offset
 */
export function toLineColumn(
  sourceFile: ts.SourceFile,
  position: number,
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: line + 1, column: character + 1 };
}
