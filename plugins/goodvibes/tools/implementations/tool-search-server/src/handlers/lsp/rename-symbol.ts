/**
 * Rename Symbol Handler
 *
 * MCP tool handler for renaming symbols across a codebase.
 * Uses the TypeScript Language Service's findRenameLocations API
 * to find all locations that need to be updated.
 *
 * @module handlers/lsp/rename-symbol
 */

import * as path from 'path';

import { PROJECT_ROOT } from '../../config.js';
import { ToolResponse } from '../../types.js';
import { languageServiceManager } from './language-service.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the rename_symbol tool.
 */
export interface RenameSymbolArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** The new name for the symbol */
  new_name: string;
}

/**
 * A single text edit for renaming.
 */
interface RenameEdit {
  /** File path relative to project root */
  file: string;
  /** Start line (1-based) */
  line: number;
  /** Start column (1-based) */
  column: number;
  /** End line (1-based) */
  end_line: number;
  /** End column (1-based) */
  end_column: number;
  /** The original text being replaced */
  old_text: string;
  /** The new text (the new name) */
  new_text: string;
}

/**
 * Result of the rename_symbol operation.
 */
interface RenameResult {
  /** Whether the rename is valid and can be performed */
  can_rename: boolean;
  /** If can_rename is false, explains why */
  reason?: string;
  /** Array of edits to apply */
  edits: RenameEdit[];
  /** List of unique files that would be affected */
  files_affected: string[];
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the rename_symbol MCP tool call.
 *
 * Finds all locations where a symbol needs to be renamed and returns
 * the edits that would need to be applied.
 *
 * @param args - Tool arguments
 * @returns MCP tool response with rename edits
 *
 * @example
 * // Rename a function from 'oldName' to 'newName'
 * const result = await handleRenameSymbol({
 *   file: 'src/utils.ts',
 *   line: 10,
 *   column: 17,
 *   new_name: 'newName'
 * });
 * // Returns:
 * // {
 * //   can_rename: true,
 * //   edits: [
 * //     { file: 'src/utils.ts', line: 10, column: 17, ... },
 * //     { file: 'src/index.ts', line: 5, column: 10, ... }
 * //   ],
 * //   files_affected: ['src/utils.ts', 'src/index.ts']
 * // }
 */
export async function handleRenameSymbol(args: RenameSymbolArgs): Promise<ToolResponse> {
  // Validate input
  if (!args.file || typeof args.file !== 'string') {
    return createErrorResponse('Missing or invalid "file" parameter');
  }
  if (typeof args.line !== 'number' || args.line < 1) {
    return createErrorResponse('Missing or invalid "line" parameter (must be >= 1)');
  }
  if (typeof args.column !== 'number' || args.column < 1) {
    return createErrorResponse('Missing or invalid "column" parameter (must be >= 1)');
  }
  if (!args.new_name || typeof args.new_name !== 'string') {
    return createErrorResponse('Missing or invalid "new_name" parameter');
  }

  // Validate the new name is a valid identifier
  if (!isValidIdentifier(args.new_name)) {
    return createErrorResponse(
      `Invalid identifier: "${args.new_name}". Must be a valid JavaScript/TypeScript identifier.`
    );
  }

  try {
    // Resolve file path relative to project root
    const filePath = path.resolve(PROJECT_ROOT, args.file);

    // Get language service for the file
    const { service } = await languageServiceManager.getServiceForFile(filePath);

    // Convert line/column to offset
    const position = languageServiceManager.getPositionOffset(
      service,
      filePath,
      args.line,
      args.column
    );

    // First, check if the symbol can be renamed
    const renameInfo = service.getRenameInfo(filePath, position, {
      allowRenameOfImportPath: false,
    });

    if (!renameInfo.canRename) {
      const result: RenameResult = {
        can_rename: false,
        reason: renameInfo.localizedErrorMessage || 'Symbol cannot be renamed',
        edits: [],
        files_affected: [],
      };
      return createSuccessResponse(result);
    }

    // Find all rename locations
    const renameLocations = service.findRenameLocations(
      filePath,
      position,
      /* findInStrings */ false,
      /* findInComments */ false,
      /* preferences */ undefined
    );

    if (!renameLocations || renameLocations.length === 0) {
      const result: RenameResult = {
        can_rename: false,
        reason: 'No rename locations found',
        edits: [],
        files_affected: [],
      };
      return createSuccessResponse(result);
    }

    // Convert locations to edits
    const edits: RenameEdit[] = [];
    const filesSet = new Set<string>();

    for (const location of renameLocations) {
      const locationFilePath = location.fileName;
      filesSet.add(locationFilePath);

      // Get start position
      const startPos = languageServiceManager.getLineAndColumn(
        service,
        locationFilePath,
        location.textSpan.start
      );

      // Get end position
      const endPos = languageServiceManager.getLineAndColumn(
        service,
        locationFilePath,
        location.textSpan.start + location.textSpan.length
      );

      // Get the original text at this location
      const program = service.getProgram();
      const sourceFile = program?.getSourceFile(locationFilePath);
      const oldText = sourceFile
        ? sourceFile.text.slice(
            location.textSpan.start,
            location.textSpan.start + location.textSpan.length
          )
        : renameInfo.displayName;

      // Create edit with relative file path
      const relativeFilePath = path.relative(PROJECT_ROOT, locationFilePath);
      edits.push({
        file: relativeFilePath.replace(/\\/g, '/'), // Normalize to forward slashes
        line: startPos.line,
        column: startPos.column,
        end_line: endPos.line,
        end_column: endPos.column,
        old_text: oldText,
        new_text: args.new_name,
      });
    }

    // Convert files set to array with relative paths
    const filesAffected = Array.from(filesSet).map((f) =>
      path.relative(PROJECT_ROOT, f).replace(/\\/g, '/')
    );

    // Sort edits by file, then by position (reverse order for applying)
    edits.sort((a, b) => {
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }
      if (a.line !== b.line) {
        return b.line - a.line; // Reverse order for safe application
      }
      return b.column - a.column; // Reverse order for safe application
    });

    const result: RenameResult = {
      can_rename: true,
      edits,
      files_affected: filesAffected.sort(),
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to rename symbol: ${message}`);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a string is a valid JavaScript/TypeScript identifier.
 */
function isValidIdentifier(name: string): boolean {
  // Basic check: must not be empty, must start with letter/underscore/$,
  // can contain letters, digits, underscores, $
  if (!name || name.length === 0) {
    return false;
  }

  // Check against reserved words
  const reserved = new Set([
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
    'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
    'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
    'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
    'protected', 'public', 'static', 'yield', 'null', 'true', 'false',
  ]);

  if (reserved.has(name)) {
    return false;
  }

  // Check valid identifier pattern
  // First character: letter, underscore, or dollar sign
  // Subsequent: letter, digit, underscore, or dollar sign
  const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  return identifierPattern.test(name);
}

/**
 * Create a success response with JSON content.
 */
function createSuccessResponse(data: RenameResult): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an error response.
 */
function createErrorResponse(message: string): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    isError: true,
  };
}
