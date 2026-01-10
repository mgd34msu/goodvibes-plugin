/**
 * Call Hierarchy Handler
 *
 * Provides call hierarchy information for a symbol at a given position.
 * Uses the TypeScript Language Service API for accurate semantic analysis.
 *
 * @module handlers/lsp/call-hierarchy
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_call_hierarchy tool.
 */
export interface GetCallHierarchyArgs {
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Direction: incoming, outgoing, or both */
  direction?: 'incoming' | 'outgoing' | 'both';
}

/**
 * A call hierarchy item representing a function/method.
 */
interface CallHierarchyItem {
  /** Symbol name */
  name: string;
  /** Symbol kind (function, method, etc.) */
  kind: string;
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * A call site location.
 */
interface CallSite {
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * An incoming call (who calls this function).
 */
interface IncomingCall {
  /** The calling function/method */
  from: CallHierarchyItem;
  /** Locations where the call occurs */
  call_sites: CallSite[];
}

/**
 * An outgoing call (what this function calls).
 */
interface OutgoingCall {
  /** The called function/method */
  to: CallHierarchyItem;
  /** Locations where the call occurs */
  call_sites: CallSite[];
}

/**
 * Result of the get_call_hierarchy tool.
 */
interface GetCallHierarchyResult {
  /** The symbol at the queried position */
  item: CallHierarchyItem | null;
  /** Functions/methods that call this symbol */
  incoming: IncomingCall[];
  /** Functions/methods called by this symbol */
  outgoing: OutgoingCall[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map TypeScript ScriptElementKind to a user-friendly kind string.
 */
function mapScriptElementKind(kind: ts.ScriptElementKind): string {
  const kindMap: { [key: string]: string } = {
    'unknown': 'unknown',
    'warning': 'warning',
    'keyword': 'keyword',
    'script': 'script',
    'module': 'module',
    'class': 'class',
    'local class': 'class',
    'interface': 'interface',
    'type': 'type',
    'enum': 'enum',
    'enum member': 'enum-member',
    'var': 'variable',
    'local var': 'variable',
    'function': 'function',
    'local function': 'function',
    'method': 'method',
    'getter': 'getter',
    'setter': 'setter',
    'property': 'property',
    'constructor': 'constructor',
    'call': 'call-signature',
    'index': 'index-signature',
    'construct': 'construct-signature',
    'parameter': 'parameter',
    'type parameter': 'type-parameter',
    'primitive type': 'primitive',
    'label': 'label',
    'alias': 'alias',
    'const': 'const',
    'let': 'let',
    'directory': 'directory',
    'external module name': 'external-module',
    'JSX attribute': 'jsx-attribute',
    'string': 'string',
    'link': 'link',
    'link name': 'link-name',
    'link text': 'link-text',
    'using': 'using',
    'await using': 'await-using',
    'accessor': 'accessor',
  };

  return kindMap[kind] ?? 'unknown';
}

/**
 * Convert a CallHierarchyItem from TypeScript to our format.
 */
function convertCallHierarchyItem(
  item: ts.CallHierarchyItem,
  service: ts.LanguageService
): CallHierarchyItem {
  const { line, column } = languageServiceManager.getLineAndColumn(
    service,
    item.file,
    item.selectionSpan.start
  );

  return {
    name: item.name,
    kind: mapScriptElementKind(item.kind),
    file: makeRelativePath(item.file, PROJECT_ROOT),
    line,
    column,
  };
}

/**
 * Convert call sites from TypeScript TextSpan to our CallSite format.
 */
function convertCallSites(
  fromSpans: readonly ts.TextSpan[],
  fileName: string,
  service: ts.LanguageService
): CallSite[] {
  return fromSpans.map((span) => {
    const { line, column } = languageServiceManager.getLineAndColumn(
      service,
      fileName,
      span.start
    );
    return { line, column };
  });
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the get_call_hierarchy MCP tool call.
 *
 * Gets the call hierarchy for a symbol at the given position using the TypeScript
 * Language Service. Returns incoming calls (who calls this) and/or outgoing calls
 * (what this calls).
 *
 * @param args - The get_call_hierarchy tool arguments
 * @returns MCP tool response with JSON-formatted call hierarchy
 *
 * @example
 * ```typescript
 * const result = await handleGetCallHierarchy({
 *   file: 'src/utils.ts',
 *   line: 10,
 *   column: 17,
 *   direction: 'both'
 * });
 * // Returns call hierarchy with incoming and outgoing calls
 * ```
 */
export async function handleGetCallHierarchy(
  args: GetCallHierarchyArgs
): Promise<ToolResponse> {
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

    const direction = args.direction ?? 'both';
    if (!['incoming', 'outgoing', 'both'].includes(direction)) {
      return createErrorResponse('Invalid direction: must be "incoming", "outgoing", or "both"');
    }

    // Resolve file path relative to PROJECT_ROOT
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(PROJECT_ROOT, args.file);

    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`);
    }

    // Get language service for the file
    const { service } = await languageServiceManager.getServiceForFile(normalizedFilePath);

    // Convert line/column to offset
    const position = languageServiceManager.getPositionOffset(
      service,
      normalizedFilePath,
      args.line,
      args.column
    );

    // Prepare call hierarchy - get the item at position
    const callHierarchyItems = service.prepareCallHierarchy(normalizedFilePath, position);

    // Handle the case where prepareCallHierarchy returns undefined, empty array, or single item
    if (!callHierarchyItems) {
      const result: GetCallHierarchyResult = {
        item: null,
        incoming: [],
        outgoing: [],
      };
      return createSuccessResponse(result);
    }

    // Normalize to array and check if empty
    const itemsArray = Array.isArray(callHierarchyItems) ? callHierarchyItems : [callHierarchyItems];
    if (itemsArray.length === 0) {
      const result: GetCallHierarchyResult = {
        item: null,
        incoming: [],
        outgoing: [],
      };
      return createSuccessResponse(result);
    }

    // Use the first item (most specific)
    const primaryItem = itemsArray[0];

    const item = convertCallHierarchyItem(primaryItem, service);

    // Get incoming calls if requested
    const incoming: IncomingCall[] = [];
    if (direction === 'incoming' || direction === 'both') {
      const incomingCalls = service.provideCallHierarchyIncomingCalls(
        normalizedFilePath,
        position
      );

      if (incomingCalls) {
        for (const call of incomingCalls) {
          incoming.push({
            from: convertCallHierarchyItem(call.from, service),
            call_sites: convertCallSites(call.fromSpans, call.from.file, service),
          });
        }
      }
    }

    // Get outgoing calls if requested
    const outgoing: OutgoingCall[] = [];
    if (direction === 'outgoing' || direction === 'both') {
      const outgoingCalls = service.provideCallHierarchyOutgoingCalls(
        normalizedFilePath,
        position
      );

      if (outgoingCalls) {
        for (const call of outgoingCalls) {
          outgoing.push({
            to: convertCallHierarchyItem(call.to, service),
            call_sites: convertCallSites(call.fromSpans, primaryItem.file, service),
          });
        }
      }
    }

    // Sort results by file, then line
    incoming.sort((a, b) => {
      const fileCompare = a.from.file.localeCompare(b.from.file);
      if (fileCompare !== 0) return fileCompare;
      return a.from.line - b.from.line;
    });

    outgoing.sort((a, b) => {
      const fileCompare = a.to.file.localeCompare(b.to.file);
      if (fileCompare !== 0) return fileCompare;
      return a.to.line - b.to.line;
    });

    const result: GetCallHierarchyResult = {
      item,
      incoming,
      outgoing,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get call hierarchy: ${message}`);
  }
}
