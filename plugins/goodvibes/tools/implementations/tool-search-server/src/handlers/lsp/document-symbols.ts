/**
 * Get Document Symbols Handler
 *
 * Returns the structural outline of a document including classes, functions,
 * interfaces, variables, and other symbols. Uses the TypeScript Language Service
 * API's getNavigationTree() for accurate hierarchical analysis.
 *
 * @module handlers/lsp/document-symbols
 */

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
 * Arguments for the get_document_symbols tool.
 */
export interface GetDocumentSymbolsArgs {
  /** File path relative to project root or absolute */
  file: string;
}

/**
 * A document symbol with position and optional children.
 */
interface DocumentSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind (class, function, interface, variable, etc.) */
  kind: string;
  /** Start line number (1-based) */
  line: number;
  /** Start column number (1-based) */
  column: number;
  /** End line number (1-based) */
  end_line: number;
  /** End column number (1-based) */
  end_column: number;
  /** Nested child symbols */
  children: DocumentSymbol[];
}

/**
 * Result of the get_document_symbols tool.
 */
interface GetDocumentSymbolsResult {
  /** Array of top-level symbols */
  symbols: DocumentSymbol[];
  /** The file path that was analyzed */
  file: string;
  /** Total count of top-level symbols */
  count: number;
}

// =============================================================================
// Symbol Kind Mapping
// =============================================================================

/**
 * Map TypeScript ScriptElementKind to human-readable symbol kind names.
 */
function getSymbolKind(kind: string): string {
  // ts.ScriptElementKind values
  const kindMap: Record<string, string> = {
    // Core types
    'module': 'module',
    'class': 'class',
    'interface': 'interface',
    'type': 'type',
    'enum': 'enum',
    'function': 'function',
    'var': 'variable',
    'let': 'variable',
    'const': 'constant',
    'local var': 'variable',
    'local function': 'function',
    'parameter': 'parameter',
    // Class members
    'method': 'method',
    'getter': 'getter',
    'setter': 'setter',
    'property': 'property',
    'constructor': 'constructor',
    'index': 'index',
    // Module/namespace
    'namespace': 'namespace',
    'alias': 'alias',
    // Other
    'call': 'call',
    'new': 'constructor',
    'enum member': 'enum_member',
    'type parameter': 'type_parameter',
    'primitive type': 'primitive',
    'label': 'label',
    'keyword': 'keyword',
    'script': 'file',
    'directory': 'directory',
    'external module name': 'module',
    'JSX attribute': 'property',
    'string': 'string',
    '': 'unknown',
  };

  return kindMap[kind] ?? kind;
}

// =============================================================================
// Navigation Tree Processing
// =============================================================================

/**
 * Convert a TypeScript NavigationTree node to a DocumentSymbol.
 *
 * @param node - The navigation tree node
 * @param sourceFile - The source file for position conversion
 * @returns The document symbol with children
 */
function convertNavigationTreeItem(
  node: ts.NavigationTree,
  sourceFile: ts.SourceFile
): DocumentSymbol | null {
  // Skip the root "script" node that wraps everything
  if (node.kind === ts.ScriptElementKind.scriptElement && node.text === '') {
    // Process children directly
    return null;
  }

  // Skip "<function>" anonymous function placeholders - they're not useful
  if (node.text.startsWith('<') && node.text.endsWith('>')) {
    return null;
  }

  // Get position from the first span (there may be multiple for merged declarations)
  const spans = node.spans;
  if (!spans || spans.length === 0) {
    return null;
  }

  const firstSpan = spans[0];
  const start = sourceFile.getLineAndCharacterOfPosition(firstSpan.start);
  const end = sourceFile.getLineAndCharacterOfPosition(firstSpan.start + firstSpan.length);

  // Process children recursively
  const children: DocumentSymbol[] = [];
  if (node.childItems && node.childItems.length > 0) {
    for (const child of node.childItems) {
      const childSymbol = convertNavigationTreeItem(child, sourceFile);
      if (childSymbol) {
        children.push(childSymbol);
      }
    }
  }

  return {
    name: node.text,
    kind: getSymbolKind(node.kind),
    line: start.line + 1, // Convert to 1-based
    column: start.character + 1,
    end_line: end.line + 1,
    end_column: end.character + 1,
    children,
  };
}

/**
 * Extract all symbols from a navigation tree, handling the root node specially.
 *
 * @param tree - The navigation tree
 * @param sourceFile - The source file for position conversion
 * @returns Array of document symbols
 */
function extractSymbols(
  tree: ts.NavigationTree,
  sourceFile: ts.SourceFile
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  // The root is typically a "script" node containing all top-level items
  if (tree.kind === ts.ScriptElementKind.scriptElement) {
    // Process top-level children
    if (tree.childItems && tree.childItems.length > 0) {
      for (const child of tree.childItems) {
        const symbol = convertNavigationTreeItem(child, sourceFile);
        if (symbol) {
          symbols.push(symbol);
        }
      }
    }
  } else {
    // If the root is not a script element, convert it directly
    const symbol = convertNavigationTreeItem(tree, sourceFile);
    if (symbol) {
      symbols.push(symbol);
    }
  }

  return symbols;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the get_document_symbols MCP tool call.
 *
 * Returns the structural outline of a document including classes, functions,
 * interfaces, and other symbols in a hierarchical tree structure.
 *
 * @param args - The get_document_symbols tool arguments
 * @returns MCP tool response with JSON-formatted symbols
 *
 * @example
 * ```typescript
 * const result = await handleGetDocumentSymbols({
 *   file: 'src/utils.ts'
 * });
 * // Returns symbols with name, kind, position, and children
 * ```
 */
export async function handleGetDocumentSymbols(
  args: GetDocumentSymbolsArgs
): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.file) {
      return createErrorResponse('Missing required argument: file');
    }

    // Resolve file path relative to PROJECT_ROOT
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(PROJECT_ROOT, args.file);

    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    // Get language service for the file
    const { service, program } = await languageServiceManager.getServiceForFile(
      normalizedFilePath
    );

    // Get the source file for position conversion
    const sourceFile = program.getSourceFile(normalizedFilePath);
    if (!sourceFile) {
      return createErrorResponse(`Source file not found: ${args.file}`);
    }

    // Get the navigation tree for the document
    const navigationTree = service.getNavigationTree(normalizedFilePath);

    if (!navigationTree) {
      const result: GetDocumentSymbolsResult = {
        symbols: [],
        file: makeRelativePath(normalizedFilePath, PROJECT_ROOT),
        count: 0,
      };
      return createSuccessResponse(result);
    }

    // Extract symbols from the navigation tree
    const symbols = extractSymbols(navigationTree, sourceFile);

    const result: GetDocumentSymbolsResult = {
      symbols,
      file: makeRelativePath(normalizedFilePath, PROJECT_ROOT),
      count: symbols.length,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get document symbols: ${message}`);
  }
}
