/**
 * Inlay Hints Handler
 *
 * Provides MCP tool for getting TypeScript inlay hints to see inferred types
 * where they're implicit. Returns hints for inferred return types, variable types,
 * parameter names at call sites, and inferred type arguments.
 *
 * @module handlers/lsp/inlay-hints
 */

import * as fs from 'fs';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  resolveFilePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/** Arguments for get_inlay_hints tool */
export interface GetInlayHintsArgs {
  /** File path (relative to project root or absolute) */
  file: string;
  /** Start line of range to get hints for (1-based, optional) */
  start_line?: number;
  /** End line of range to get hints for (1-based, optional) */
  end_line?: number;
}

/** A single inlay hint */
interface InlayHint {
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** The hint text (the inferred type or parameter name) */
  text: string;
  /** The kind of inlay hint */
  kind: 'type' | 'parameter' | 'enum';
  /** Whether there should be padding before the hint */
  padding_left: boolean;
  /** Whether there should be padding after the hint */
  padding_right: boolean;
}

/** Result of get_inlay_hints */
interface InlayHintsResult {
  /** Array of inlay hints */
  hints: InlayHint[];
  /** The file that was analyzed */
  file: string;
  /** The range that was analyzed */
  range: {
    start_line: number;
    end_line: number;
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Map TypeScript InlayHintKind to our simplified kind string.
 */
function mapInlayHintKind(kind: ts.InlayHintKind): InlayHint['kind'] {
  switch (kind) {
    case ts.InlayHintKind.Type:
      return 'type';
    case ts.InlayHintKind.Parameter:
      return 'parameter';
    case ts.InlayHintKind.Enum:
      return 'enum';
    default:
      return 'type';
  }
}

/**
 * Extract text from InlayHintDisplayPart array or string.
 */
function extractHintText(
  text: string | ts.InlayHintDisplayPart[]
): string {
  if (typeof text === 'string') {
    return text;
  }
  return text.map((part) => part.text).join('');
}

/**
 * Get inlay hint preferences for TypeScript Language Service.
 */
function getInlayHintsPreferences(): ts.UserPreferences {
  return {
    includeInlayParameterNameHints: 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName: false,
    includeInlayFunctionParameterTypeHints: true,
    includeInlayVariableTypeHints: true,
    includeInlayVariableTypeHintsWhenTypeMatchesName: false,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  };
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle get_inlay_hints MCP tool call.
 *
 * Gets inlay hints for a file to see inferred types where they're implicit.
 * Uses the TypeScript Language Service's provideInlayHints method.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with inlay hints
 *
 * @example
 * // Get hints for entire file
 * await handleGetInlayHints({ file: 'src/utils.ts' });
 *
 * @example
 * // Get hints for specific range
 * await handleGetInlayHints({
 *   file: 'src/api.ts',
 *   start_line: 20,
 *   end_line: 40
 * });
 */
export async function handleGetInlayHints(
  args: GetInlayHintsArgs
): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.file) {
    return createErrorResponse('Missing required argument: file');
  }

  // Resolve file path
  const filePath = resolveFilePath(args.file, PROJECT_ROOT);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, {
      file: args.file,
    });
  }

  try {
    // Get language service for the file
    const { service } = await languageServiceManager.getServiceForFile(filePath);

    // Get source file to determine line count
    const program = service.getProgram();
    if (!program) {
      return createErrorResponse('Failed to get TypeScript program', {
        file: args.file,
      });
    }

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return createErrorResponse('Failed to get source file', {
        file: args.file,
      });
    }

    // Calculate the line count
    const lineCount = sourceFile.getLineStarts().length;

    // Determine the range to analyze
    const startLine = args.start_line ?? 1;
    const endLine = args.end_line ?? lineCount;

    // Validate line numbers
    if (startLine < 1 || startLine > lineCount) {
      return createErrorResponse(
        `Invalid start_line: ${startLine}. File has ${lineCount} lines.`,
        { file: args.file, line_count: lineCount }
      );
    }

    if (endLine < startLine || endLine > lineCount) {
      return createErrorResponse(
        `Invalid end_line: ${endLine}. Must be >= start_line (${startLine}) and <= ${lineCount}.`,
        { file: args.file, line_count: lineCount }
      );
    }

    // Convert line numbers to text span
    // Lines are 1-based, getPositionOfLineAndCharacter uses 0-based lines
    const startPosition = sourceFile.getPositionOfLineAndCharacter(startLine - 1, 0);
    const endPosition = endLine >= lineCount
      ? sourceFile.text.length
      : sourceFile.getPositionOfLineAndCharacter(endLine, 0);

    const span: ts.TextSpan = {
      start: startPosition,
      length: endPosition - startPosition,
    };

    // Get inlay hints from the language service
    const preferences = getInlayHintsPreferences();
    const tsHints = service.provideInlayHints(filePath, span, preferences);

    // Transform TypeScript hints to our format
    const hints: InlayHint[] = tsHints.map((hint) => {
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        filePath,
        hint.position
      );

      return {
        line,
        column,
        text: extractHintText(hint.text),
        kind: mapInlayHintKind(hint.kind),
        padding_left: hint.whitespaceBefore ?? false,
        padding_right: hint.whitespaceAfter ?? false,
      };
    });

    // Sort hints by position (line, then column)
    hints.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return a.column - b.column;
    });

    const result: InlayHintsResult = {
      hints,
      file: makeRelativePath(filePath, PROJECT_ROOT),
      range: {
        start_line: startLine,
        end_line: endLine,
      },
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get inlay hints: ${message}`, {
      file: args.file,
    });
  }
}
