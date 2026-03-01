/**
 * Line Preview Helpers
 *
 * Extracted from lsp-utils.ts. Provides code preview snippets
 * for reference locations shown in tool output.
 *
 * @module core/code-intel/preview
 */

import type ts from 'typescript';

import { MAX_PREVIEW_LENGTH } from './constants.js';

/**
 * Get a preview of a specific line from a source file via the language service.
 *
 * @param service - The TypeScript language service
 * @param fileName - The file name to get preview from
 * @param line - The 1-based line number
 * @returns The line content (trimmed and truncated if needed), or empty string on error
 */
export function getLinePreview(
  service: ts.LanguageService,
  fileName: string,
  line: number
): string {
  try {
    const sourceFile = service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) return '';

    const lineStarts = sourceFile.getLineStarts();
    if (line < 1 || line > lineStarts.length) return '';

    const lineStart = lineStarts[line - 1];
    const lineEnd = line < lineStarts.length ? lineStarts[line] : sourceFile.text.length;
    const lineText = sourceFile.text.slice(lineStart, lineEnd).replace(/[\r\n]+$/, '').trim();

    return lineText.length > MAX_PREVIEW_LENGTH
      ? lineText.slice(0, MAX_PREVIEW_LENGTH) + '...'
      : lineText;
  } catch {
    return '';
  }
}

/**
 * Get a preview of a line from a TypeScript source file object directly.
 *
 * @param sourceFile - The TypeScript source file
 * @param line - The 1-based line number
 * @returns The line content (trimmed and truncated if needed), or empty string on error
 */
export function getPreviewFromSourceFile(
  sourceFile: ts.SourceFile,
  line: number
): string {
  try {
    const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
    const lineEnd = line < sourceFile.getLineStarts().length
      ? sourceFile.getPositionOfLineAndCharacter(line, 0)
      : sourceFile.text.length;

    const preview = sourceFile.text.slice(lineStart, lineEnd).trim();

    return preview.length > MAX_PREVIEW_LENGTH
      ? preview.slice(0, MAX_PREVIEW_LENGTH) + '...'
      : preview;
  } catch {
    return '';
  }
}
