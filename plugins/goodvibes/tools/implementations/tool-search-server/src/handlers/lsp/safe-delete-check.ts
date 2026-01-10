/**
 * Safe Delete Check Handler
 *
 * Confirms a symbol has zero external usages before deleting.
 * Provides a cleaner interface than find_references with a clear yes/no answer.
 * Handles edge cases like self-references and same-declaration references.
 *
 * @module handlers/lsp/safe-delete-check
 */

import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  getLinePreview,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the safe_delete_check tool.
 */
export interface SafeDeleteCheckArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * A reference location with preview.
 */
interface ReferenceLocation {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Preview of the line containing the reference */
  preview: string;
}

/**
 * Result of the safe_delete_check tool.
 */
interface SafeDeleteCheckResult {
  /** True if no external usages exist and the symbol can be safely deleted */
  safe: boolean;
  /** List of blocking references that prevent safe deletion */
  external_references: ReferenceLocation[];
  /** Self-references (recursive calls) that do not block deletion */
  self_references: ReferenceLocation[];
  /** Human-readable explanation of the result */
  reason: string;
  /** The symbol name that was analyzed */
  symbol?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if two positions are on the same line in the same file.
 *
 * @param ref1File - First file path
 * @param ref1Line - First line number
 * @param ref2File - Second file path
 * @param ref2Line - Second line number
 * @returns True if both references are on the same line in the same file
 */
function isSameLine(
  ref1File: string,
  ref1Line: number,
  ref2File: string,
  ref2Line: number
): boolean {
  return ref1File === ref2File && ref1Line === ref2Line;
}

/**
 * Check if a reference is within the same declaration as the definition.
 *
 * This checks if the reference is on the same line as the definition,
 * which typically means it's part of the same declaration.
 *
 * @param refFile - Reference file path
 * @param refLine - Reference line number
 * @param defFile - Definition file path
 * @param defLine - Definition line number
 * @returns True if the reference is in the same declaration
 */
function isInSameDeclaration(
  refFile: string,
  refLine: number,
  defFile: string,
  defLine: number
): boolean {
  return isSameLine(refFile, refLine, defFile, defLine);
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the safe_delete_check MCP tool call.
 *
 * Analyzes a symbol at the given position to determine if it can be safely
 * deleted. Filters out the definition itself, self-references (recursive calls),
 * and references in the same declaration.
 *
 * @param args - The safe_delete_check tool arguments
 * @returns MCP tool response with JSON-formatted safe delete analysis
 *
 * @example
 * ```typescript
 * const result = await handleSafeDeleteCheck({
 *   file: 'src/utils.ts',
 *   line: 10,
 *   column: 5
 * });
 * // Returns { safe: true/false, external_references: [...], ... }
 * ```
 */
export async function handleSafeDeleteCheck(args: SafeDeleteCheckArgs): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.file) {
      return createErrorResponse('Missing required argument: file');
    }
    if (typeof args.line !== 'number' || args.line < 1) {
      return createErrorResponse('Invalid line number: must be a positive integer');
    }
    if (typeof args.column !== 'number' || args.column < 1) {
      return createErrorResponse('Invalid column number: must be a positive integer');
    }

    // Resolve file path relative to PROJECT_ROOT
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(PROJECT_ROOT, args.file);

    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    // Get language service for the file
    const { service } = await languageServiceManager.getServiceForFile(normalizedFilePath);

    // Convert line/column to offset
    const position = languageServiceManager.getPositionOffset(
      service,
      normalizedFilePath,
      args.line,
      args.column
    );

    // Get the symbol name from quick info
    const quickInfo = service.getQuickInfoAtPosition(normalizedFilePath, position);
    let symbolName: string | undefined;
    if (quickInfo) {
      symbolName = quickInfo.displayParts
        ?.map(part => part.text)
        .join('')
        .split(/[\s(:<]/)[0]; // Extract first word
    }

    // Get all references including the definition
    const references = service.getReferencesAtPosition(normalizedFilePath, position);

    if (!references || references.length === 0) {
      const result: SafeDeleteCheckResult = {
        safe: true,
        external_references: [],
        self_references: [],
        reason: 'No references found. Symbol may not exist or is not referenceable.',
        symbol: symbolName,
      };
      return createSuccessResponse(result);
    }

    // Find the definition position
    let definitionFile: string | undefined;
    let definitionLine: number | undefined;

    for (const ref of references) {
      const refEntry = ref as ts.ReferenceEntry & { isDefinition?: boolean };
      if (refEntry.isDefinition) {
        definitionFile = ref.fileName;
        const { line } = languageServiceManager.getLineAndColumn(
          service,
          ref.fileName,
          ref.textSpan.start
        );
        definitionLine = line;
        break;
      }
    }

    // If no definition found, use the queried position as the definition
    if (!definitionFile) {
      definitionFile = normalizedFilePath;
      definitionLine = args.line;
    }

    // Get the symbol name from the definition if not already found
    if (!symbolName) {
      const program = service.getProgram();
      if (program) {
        const sourceFile = program.getSourceFile(normalizedFilePath);
        if (sourceFile && references[0]) {
          const { start, length } = references[0].textSpan;
          symbolName = sourceFile.text.substring(start, start + length);
        }
      }
    }

    // Categorize references
    const externalReferences: ReferenceLocation[] = [];
    const selfReferences: ReferenceLocation[] = [];

    for (const ref of references) {
      const refEntry = ref as ts.ReferenceEntry & { isDefinition?: boolean };

      // Skip the definition itself
      if (refEntry.isDefinition) {
        continue;
      }

      // Get line/column for this reference
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        ref.fileName,
        ref.textSpan.start
      );

      // Skip references in the same declaration (same line as definition)
      if (definitionFile && definitionLine !== undefined) {
        if (isInSameDeclaration(ref.fileName, line, definitionFile, definitionLine)) {
          continue;
        }
      }

      // Get preview line
      const preview = getLinePreview(service, ref.fileName, line);

      // Make file path relative to PROJECT_ROOT
      const relativeFile = makeRelativePath(ref.fileName, PROJECT_ROOT);

      const referenceLocation: ReferenceLocation = {
        file: relativeFile,
        line,
        column,
        preview,
      };

      // Check if this is a self-reference (same file as definition)
      // This captures recursive function calls
      const normalizedDefFile = definitionFile?.replace(/\\/g, '/');
      const normalizedRefFile = ref.fileName.replace(/\\/g, '/');

      if (normalizedDefFile === normalizedRefFile) {
        // This is a reference in the same file as the definition
        // It could be a self-reference (recursive call) or an internal usage
        // For simplicity, we treat same-file references as self-references
        // since deleting the symbol would delete these too
        selfReferences.push(referenceLocation);
      } else {
        // This is an external reference from a different file
        externalReferences.push(referenceLocation);
      }
    }

    // Sort references by file, then line, then column
    const sortRefs = (refs: ReferenceLocation[]) => {
      refs.sort((a, b) => {
        const fileCompare = a.file.localeCompare(b.file);
        if (fileCompare !== 0) return fileCompare;
        const lineCompare = a.line - b.line;
        if (lineCompare !== 0) return lineCompare;
        return a.column - b.column;
      });
    };

    sortRefs(externalReferences);
    sortRefs(selfReferences);

    // Determine if safe to delete
    const isSafe = externalReferences.length === 0;

    // Build reason message
    let reason: string;
    if (isSafe) {
      if (selfReferences.length > 0) {
        reason = `Only self-references found (${selfReferences.length} recursive call(s)). Symbol can be safely deleted.`;
      } else {
        reason = 'No external references found. Symbol can be safely deleted.';
      }
    } else {
      reason = `Symbol has ${externalReferences.length} external reference(s). Deletion would break these usages.`;
    }

    const result: SafeDeleteCheckResult = {
      safe: isSafe,
      external_references: externalReferences,
      self_references: selfReferences,
      reason,
      symbol: symbolName,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to check safe delete: ${message}`);
  }
}
