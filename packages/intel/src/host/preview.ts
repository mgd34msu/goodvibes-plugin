/**
 * Line-preview helpers for reference/location output.
 *
 * Ported verbatim from project-engine `core/code-intel/preview.ts`.
 */

import type ts from 'typescript';

import { MAX_PREVIEW_LENGTH } from './constants.js';

/**
 * Preview a 1-based line from a file loaded in the language service.
 * @param service - the language service
 * @param fileName - TS-normalized file path
 * @param line - 1-based line number
 * @returns trimmed, length-capped line text (empty string on any error)
 */
export function getLinePreview(service: ts.LanguageService, fileName: string, line: number): string {
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
 * Preview a 1-based line directly from a source file object.
 * @param sourceFile - the source file
 * @param line - 1-based line number
 */
export function getPreviewFromSourceFile(sourceFile: ts.SourceFile, line: number): string {
  try {
    const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
    const lineEnd =
      line < sourceFile.getLineStarts().length
        ? sourceFile.getPositionOfLineAndCharacter(line, 0)
        : sourceFile.text.length;
    const preview = sourceFile.text.slice(lineStart, lineEnd).trim();
    return preview.length > MAX_PREVIEW_LENGTH ? preview.slice(0, MAX_PREVIEW_LENGTH) + '...' : preview;
  } catch {
    return '';
  }
}
