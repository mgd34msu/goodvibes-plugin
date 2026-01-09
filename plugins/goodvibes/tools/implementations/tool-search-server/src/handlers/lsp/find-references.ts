/**
 * Find References Handler
 *
 * Finds all references to a symbol at a given position in a TypeScript/JavaScript file.
 * Uses the TypeScript Language Service API for accurate semantic analysis.
 *
 * @module handlers/lsp/find-references
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
 * Arguments for the find_references tool.
 */
export interface FindReferencesArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Include the definition in results (default: false) */
  include_definition?: boolean;
}

/**
 * A single reference to a symbol.
 */
interface Reference {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Preview of the line containing the reference */
  preview: string;
  /** Whether this reference is the definition */
  is_definition: boolean;
  /** Whether this is a write access (assignment, etc.) */
  is_write: boolean;
}

/**
 * Result of the find_references tool.
 */
interface FindReferencesResult {
  /** Array of references found */
  references: Reference[];
  /** Total count of references */
  count: number;
  /** Symbol name that was searched */
  symbol?: string;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the find_references MCP tool call.
 *
 * Finds all references to a symbol at the given position using the TypeScript
 * Language Service. Returns file locations, preview lines, and metadata about
 * each reference.
 *
 * @param args - The find_references tool arguments
 * @returns MCP tool response with JSON-formatted references
 *
 * @example
 * ```typescript
 * const result = await handleFindReferences({
 *   file: 'src/utils.ts',
 *   line: 10,
 *   column: 5,
 *   include_definition: true
 * });
 * // Returns references with file, line, column, and preview
 * ```
 */
export async function handleFindReferences(args: FindReferencesArgs): Promise<ToolResponse> {
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

    // Get references at position
    const references = service.getReferencesAtPosition(normalizedFilePath, position);

    if (!references || references.length === 0) {
      const result: FindReferencesResult = {
        references: [],
        count: 0,
      };
      return createSuccessResponse(result);
    }

    // Get the symbol name from the first reference for context
    const program = service.getProgram();
    let symbolName: string | undefined;
    if (program) {
      const sourceFile = program.getSourceFile(normalizedFilePath);
      if (sourceFile && references[0]) {
        const { start, length } = references[0].textSpan;
        symbolName = sourceFile.text.substring(start, start + length);
      }
    }

    // Process references
    const includeDefinition = args.include_definition ?? false;
    const processedRefs: Reference[] = [];

    for (const ref of references) {
      // Access reference properties with proper typing
      // ReferenceEntry may have these as optional depending on TS version
      const refEntry = ref as ts.ReferenceEntry & {
        isDefinition?: boolean;
        isWriteAccess?: boolean;
      };

      // Skip definitions if not requested
      if (!includeDefinition && refEntry.isDefinition) {
        continue;
      }

      // Convert offset to line/column
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        ref.fileName,
        ref.textSpan.start
      );

      // Get preview line
      const preview = getLinePreview(service, ref.fileName, line);

      // Make file path relative to PROJECT_ROOT
      const relativeFile = makeRelativePath(ref.fileName, PROJECT_ROOT);

      processedRefs.push({
        file: relativeFile,
        line,
        column,
        preview,
        is_definition: refEntry.isDefinition ?? false,
        is_write: refEntry.isWriteAccess ?? false,
      });
    }

    // Sort by file, then line, then column
    processedRefs.sort((a, b) => {
      const fileCompare = a.file.localeCompare(b.file);
      if (fileCompare !== 0) return fileCompare;
      const lineCompare = a.line - b.line;
      if (lineCompare !== 0) return lineCompare;
      return a.column - b.column;
    });

    const result: FindReferencesResult = {
      references: processedRefs,
      count: processedRefs.length,
      symbol: symbolName,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to find references: ${message}`);
  }
}

