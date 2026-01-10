/**
 * Signature Help Handler
 *
 * Provides function signature information at a call site, including parameter
 * types, documentation, and which parameter the cursor is currently on.
 * Uses the TypeScript Language Service API for accurate semantic analysis.
 *
 * @module handlers/lsp/signature-help
 */

import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_signature_help tool.
 */
export interface GetSignatureHelpArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, should be inside function call parentheses) */
  column: number;
}

/**
 * A single parameter in a function signature.
 */
interface SignatureParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: string;
  /** JSDoc documentation for the parameter */
  documentation: string;
}

/**
 * A function signature with its parameters.
 */
interface Signature {
  /** Full function signature text */
  label: string;
  /** JSDoc documentation for the function */
  documentation: string;
  /** Array of parameters */
  parameters: SignatureParameter[];
  /** Index of the parameter the cursor is on (0-based) */
  active_parameter: number;
}

/**
 * Result of the get_signature_help tool.
 */
interface GetSignatureHelpResult {
  /** Array of signatures (for overloaded functions) */
  signatures: Signature[];
  /** Index of the currently active signature (0-based) */
  active_signature: number;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert TypeScript display parts to a plain string.
 *
 * @param displayParts - Array of symbol display parts
 * @returns Concatenated display string
 */
function displayPartsToString(displayParts: ts.SymbolDisplayPart[] | undefined): string {
  if (!displayParts) return '';
  return displayParts.map((part) => part.text).join('');
}

/**
 * Extract parameter type from display parts or infer from prefixDisplayParts.
 *
 * @param param - The signature help parameter
 * @returns The parameter type string
 */
function extractParameterType(param: ts.SignatureHelpParameter): string {
  // The displayParts for a parameter typically contain: name, punctuation (:), space, type
  const parts = param.displayParts;
  if (!parts || parts.length === 0) return '';

  // Find the colon separator and extract everything after it
  let afterColon = false;
  const typeParts: string[] = [];

  for (const part of parts) {
    if (afterColon) {
      typeParts.push(part.text);
    } else if (part.kind === 'punctuation' && part.text === ':') {
      afterColon = true;
    }
  }

  return typeParts.join('').trim();
}

/**
 * Extract parameter name from display parts.
 *
 * @param param - The signature help parameter
 * @returns The parameter name
 */
function extractParameterName(param: ts.SignatureHelpParameter): string {
  // Use the name property if available
  if (param.name) return param.name;

  // Otherwise, try to extract from displayParts (first part before the colon)
  const parts = param.displayParts;
  if (!parts || parts.length === 0) return '';

  const nameParts: string[] = [];
  for (const part of parts) {
    if (part.kind === 'punctuation' && part.text === ':') break;
    nameParts.push(part.text);
  }

  return nameParts.join('').trim();
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the get_signature_help MCP tool call.
 *
 * Provides function signature information at a call site using the TypeScript
 * Language Service. Returns signature labels, parameter information, and
 * documentation.
 *
 * @param args - The get_signature_help tool arguments
 * @returns MCP tool response with JSON-formatted signature help
 *
 * @example
 * ```typescript
 * const result = await handleGetSignatureHelp({
 *   file: 'src/utils.ts',
 *   line: 15,
 *   column: 25,
 * });
 * // Returns signature help with parameters and active parameter index
 * ```
 */
export async function handleGetSignatureHelp(args: GetSignatureHelpArgs): Promise<ToolResponse> {
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

    // Get signature help at position
    const signatureHelp = service.getSignatureHelpItems(
      normalizedFilePath,
      position,
      undefined // options
    );

    if (!signatureHelp || signatureHelp.items.length === 0) {
      const result: GetSignatureHelpResult = {
        signatures: [],
        active_signature: 0,
      };
      return createSuccessResponse(result);
    }

    // Process signature help items
    const signatures: Signature[] = signatureHelp.items.map((item) => {
      // Build the full signature label
      const prefixText = displayPartsToString(item.prefixDisplayParts);
      const suffixText = displayPartsToString(item.suffixDisplayParts);
      const separatorText = displayPartsToString(item.separatorDisplayParts);

      // Build parameter list for label
      const parameterLabels = item.parameters.map((param) =>
        displayPartsToString(param.displayParts)
      );
      const parametersText = parameterLabels.join(separatorText || ', ');

      const label = `${prefixText}${parametersText}${suffixText}`;

      // Extract documentation
      const documentation = displayPartsToString(item.documentation);

      // Process parameters
      const parameters: SignatureParameter[] = item.parameters.map((param) => ({
        name: extractParameterName(param),
        type: extractParameterType(param),
        documentation: displayPartsToString(param.documentation),
      }));

      return {
        label,
        documentation,
        parameters,
        active_parameter: signatureHelp.argumentIndex,
      };
    });

    const result: GetSignatureHelpResult = {
      signatures,
      active_signature: signatureHelp.selectedItemIndex,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get signature help: ${message}`);
  }
}
