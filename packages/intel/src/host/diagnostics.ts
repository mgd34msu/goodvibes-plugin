/**
 * TypeScript diagnostics collection/conversion over the shared program.
 *
 * Ported from project-engine `core/code-intel/diagnostics.ts`. Pure over a
 * `ts.LanguageService`; available to lanes 3/4 (e.g. edit/spec validation).
 */

import ts from 'typescript';

import { toTsPath, makeRelativePath } from './paths.js';

/** A diagnostic error normalized to relative-path + 1-based positions. */
export interface DiagnosticError {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  message: string;
  code: number;
  category: 'error' | 'warning';
}

/**
 * Collect syntactic + semantic error/warning diagnostics for a set of files.
 * @param service - the language service
 * @param files - TS file paths to check
 * @returns map from normalized path to diagnostics
 */
export function getDiagnosticsForFiles(
  service: ts.LanguageService,
  files: string[],
): Map<string, ts.Diagnostic[]> {
  const diagnosticsMap = new Map<string, ts.Diagnostic[]>();
  for (const file of files) {
    const normalized = toTsPath(file);
    try {
      const semantic = service.getSemanticDiagnostics(normalized);
      const syntactic = service.getSyntacticDiagnostics(normalized);
      diagnosticsMap.set(
        normalized,
        [...syntactic, ...semantic].filter(
          (d) =>
            d.category === ts.DiagnosticCategory.Error ||
            d.category === ts.DiagnosticCategory.Warning,
        ),
      );
    } catch {
      diagnosticsMap.set(normalized, []);
    }
  }
  return diagnosticsMap;
}

/**
 * Convert a TypeScript diagnostic to a {@link DiagnosticError}, or null when it
 * lacks location information.
 * @param diagnostic - the TS diagnostic
 * @param projectRoot - root used to relativize the file path
 */
export function diagnosticToError(
  diagnostic: ts.Diagnostic,
  projectRoot: string,
): DiagnosticError | null {
  if (!diagnostic.file || diagnostic.start === undefined) return null;
  const sourceFile = diagnostic.file;
  const start = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
  const end = sourceFile.getLineAndCharacterOfPosition(diagnostic.start + (diagnostic.length ?? 0));
  return {
    file: makeRelativePath(sourceFile.fileName, projectRoot),
    line: start.line + 1,
    column: start.character + 1,
    end_line: end.line + 1,
    end_column: end.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    code: diagnostic.code,
    category: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
  };
}

/**
 * Stable dedup key for a diagnostic (file:pos:code:message).
 * @param d - the diagnostic
 */
export function diagnosticKey(d: ts.Diagnostic): string {
  const file = d.file?.fileName ?? 'unknown';
  const start = d.start ?? 0;
  const code = d.code ?? 0;
  return `${file}:${start}:${code}:${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
}
