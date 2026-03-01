/**
 * TypeScript Diagnostics Utilities
 *
 * Extracted from preview-edits.ts. Provides functions to collect and
 * convert TypeScript diagnostics for edit validation.
 *
 * @module core/code-intel/diagnostics
 */

import ts from 'typescript';

import { toRelativePath } from '../../shared/utils.js';
import { normalizePath } from '../../shared/utils.js';

/**
 * Information about which edit caused a diagnostic error.
 */
export interface CausedByEdit {
  /** Relative file path */
  file: string;
  /** Index of the edit in the edits array */
  edit_index: number;
}

/**
 * A diagnostic error with source location and edit attribution.
 */
export interface DiagnosticError {
  /** Relative file path */
  file: string;
  /** Start line (1-based) */
  line: number;
  /** Start column (1-based) */
  column: number;
  /** End line (1-based) */
  end_line: number;
  /** End column (1-based) */
  end_column: number;
  /** Error message */
  message: string;
  /** TypeScript error code */
  code: number;
  /** Severity category */
  category: 'error' | 'warning';
  /** Which edit caused this error */
  caused_by_edit: CausedByEdit;
}

/**
 * Get diagnostics for a set of files using a language service.
 *
 * @param service - TypeScript language service
 * @param files - Array of file paths to check
 * @returns Map from normalized file path to diagnostics array
 */
export function getDiagnosticsForFiles(
  service: ts.LanguageService,
  files: string[]
): Map<string, ts.Diagnostic[]> {
  const diagnosticsMap = new Map<string, ts.Diagnostic[]>();

  for (const file of files) {
    const normalized = normalizePath(file);
    try {
      const semanticDiagnostics = service.getSemanticDiagnostics(normalized);
      const syntacticDiagnostics = service.getSyntacticDiagnostics(normalized);

      const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics].filter(
        (d) =>
          d.category === ts.DiagnosticCategory.Error ||
          d.category === ts.DiagnosticCategory.Warning
      );

      diagnosticsMap.set(normalized, allDiagnostics);
    } catch {
      diagnosticsMap.set(normalized, []);
    }
  }

  return diagnosticsMap;
}

/**
 * Convert a TypeScript diagnostic to a DiagnosticError.
 *
 * @param diagnostic - The TypeScript diagnostic
 * @param causedBy - Edit attribution info
 * @param projectRoot - Project root for relativizing paths
 * @returns DiagnosticError, or null if diagnostic lacks location info
 */
export function diagnosticToError(
  diagnostic: ts.Diagnostic,
  causedBy: CausedByEdit,
  projectRoot: string
): DiagnosticError | null {
  if (!diagnostic.file || diagnostic.start === undefined) {
    return null;
  }

  const sourceFile = diagnostic.file;
  const start = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
  const end = sourceFile.getLineAndCharacterOfPosition(
    diagnostic.start + (diagnostic.length ?? 0)
  );

  return {
    file: toRelativePath(sourceFile.fileName, projectRoot),
    line: start.line + 1,
    column: start.character + 1,
    end_line: end.line + 1,
    end_column: end.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    code: typeof diagnostic.code === 'number' ? diagnostic.code : 0,
    category: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
    caused_by_edit: causedBy,
  };
}

/**
 * Create a stable deduplication key for a TypeScript diagnostic.
 *
 * @param d - The TypeScript diagnostic
 * @returns A string key combining file, position, code, and message
 */
export function diagnosticKey(d: ts.Diagnostic): string {
  const file = d.file?.fileName ?? 'unknown';
  const start = d.start ?? 0;
  const code = d.code ?? 0;
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  return `${file}:${start}:${code}:${message}`;
}
