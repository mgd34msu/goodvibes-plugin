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

/**
 * MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
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

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the text content of a specific line from a file via the language service.
 */
function getLinePreview(
  service: ts.LanguageService,
  fileName: string,
  line: number
): string {
  const program = service.getProgram();
  if (!program) return '';

  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return '';

  try {
    // Get line boundaries
    const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
    const lineEndInfo = sourceFile.getLineAndCharacterOfPosition(sourceFile.text.length);
    const maxLine = lineEndInfo.line + 1;

    let lineEnd: number;
    if (line < maxLine) {
      lineEnd = sourceFile.getPositionOfLineAndCharacter(line, 0);
    } else {
      lineEnd = sourceFile.text.length;
    }

    // Extract and trim the line
    const lineText = sourceFile.text.substring(lineStart, lineEnd).trim();

    // Truncate if too long
    const maxLength = 120;
    if (lineText.length > maxLength) {
      return lineText.substring(0, maxLength) + '...';
    }

    return lineText;
  } catch {
    return '';
  }
}

/**
 * Make a file path relative to a base path.
 */
function makeRelativePath(filePath: string, basePath: string): string {
  // Normalize both paths
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedBase = basePath.replace(/\\/g, '/');

  // Use path.relative for proper relative path calculation
  const relativePath = path.relative(normalizedBase, normalizedFile);

  // Normalize the result
  return relativePath.replace(/\\/g, '/');
}

/**
 * Create a successful MCP tool response.
 */
function createSuccessResponse(result: FindReferencesResult): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}

/**
 * Create an error MCP tool response.
 */
function createErrorResponse(message: string): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ error: message }, null, 2),
    }],
    isError: true,
  };
}
