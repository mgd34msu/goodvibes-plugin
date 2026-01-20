/**
 * Get Document Symbols Handler
 *
 * Returns the structural outline of a document including classes, functions,
 * interfaces, variables, and other symbols. Uses the TypeScript Language Service
 * API's getNavigationTree() for accurate hierarchical analysis.
 *
 * Supports:
 * - Single file or batch mode (multiple files)
 * - Filtering by symbol kind (function, class, interface, etc.)
 * - Filtering by line range
 * - Depth control for nested symbols
 *
 * @module handlers/lsp/document-symbols
 */

import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../../config.js';
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

/** Output mode for controlling response verbosity */
export type OutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

/**
 * Line range filter for symbols.
 */
export interface LineRange {
  /** Only symbols starting at/after this line (1-based) */
  start?: number;
  /** Only symbols ending at/before this line (1-based) */
  end?: number;
}

/**
 * Arguments for the get_document_symbols tool.
 */
export interface GetDocumentSymbolsArgs {
  /** File path relative to project root or absolute (backward compatible) */
  file?: string;
  /** Multiple files to process in batch mode */
  files?: string[];
  /** Output verbosity (default: standard) */
  output_mode?: OutputMode;
  /** Only return symbols of these kinds (case-insensitive): 'function', 'class', 'interface', etc. */
  kind_filter?: string[];
  /** Only return symbols within this line range */
  line_range?: LineRange;
  /** Maximum depth of symbol tree (1 = top-level only, 2 = one level of nesting, etc.) */
  max_depth?: number;
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
 * Result of the get_document_symbols tool (single file mode).
 */
interface GetDocumentSymbolsResult {
  /** Array of top-level symbols */
  symbols: DocumentSymbol[];
  /** The file path that was analyzed */
  file: string;
  /** Total count of top-level symbols */
  count: number;
}

/**
 * Result for a single file in batch mode.
 */
interface SingleFileResult {
  /** The file path that was analyzed */
  file: string;
  /** Array of top-level symbols */
  symbols: DocumentSymbol[];
  /** Total count of top-level symbols */
  count: number;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Result of the get_document_symbols tool (batch mode).
 */
interface BatchDocumentSymbolsResult {
  /** Results for each file */
  results: SingleFileResult[];
  /** Total number of files processed */
  total_files: number;
  /** Total number of symbols across all files */
  total_symbols: number;
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
  /* v8 ignore next 3 -- defensive: anonymous function placeholders rarely encountered */
  if (node.text.startsWith('<') && node.text.endsWith('>')) {
    return null;
  }

  // Get position from the first span (there may be multiple for merged declarations)
  const spans = node.spans;
  /* v8 ignore next 3 -- defensive: navigation tree nodes always have spans */
  if (!spans || spans.length === 0) {
    return null;
  }

  const firstSpan = spans[0];
  const start = sourceFile.getLineAndCharacterOfPosition(firstSpan.start);
  const end = sourceFile.getLineAndCharacterOfPosition(firstSpan.start + firstSpan.length);

  // Determine the kind - TypeScript reports 'module' for both ES modules and namespaces
  // Check the source text to distinguish between them
  let kind = node.kind;
  if (kind === ts.ScriptElementKind.moduleElement) {
    // Check if this is a namespace declaration by looking at the source text
    const sourceText = sourceFile.getFullText();
    const spanStart = firstSpan.start;
    // Look for 'namespace' keyword before the declaration
    const textBefore = sourceText.slice(Math.max(0, spanStart - 50), spanStart + 20);
    if (/\bnamespace\s+/.test(textBefore)) {
      kind = 'namespace' as ts.ScriptElementKind;
    }
  }

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
    kind: getSymbolKind(kind),
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
// Filtering Functions
// =============================================================================

/**
 * Normalize a kind filter for case-insensitive matching.
 * Also handles common aliases.
 */
function normalizeKind(kind: string): string {
  const normalized = kind.toLowerCase().trim();
  // Handle common aliases
  const aliases: Record<string, string> = {
    func: 'function',
    fn: 'function',
    const: 'constant',
    var: 'variable',
    iface: 'interface',
    mod: 'module',
    ns: 'namespace',
  };
  return aliases[normalized] ?? normalized;
}

/**
 * Filter symbols by kind.
 *
 * @param symbols - Array of symbols to filter
 * @param kindFilter - Array of kinds to include (case-insensitive)
 * @returns Filtered symbols (recursively filters children too)
 */
function filterByKind(
  symbols: DocumentSymbol[],
  kindFilter: string[]
): DocumentSymbol[] {
  const normalizedFilter = new Set(kindFilter.map(normalizeKind));

  function filterSymbol(symbol: DocumentSymbol): DocumentSymbol | null {
    // Filter children first
    const filteredChildren = symbol.children
      .map(filterSymbol)
      .filter((s): s is DocumentSymbol => s !== null);

    // Check if this symbol matches the filter
    const matchesFilter = normalizedFilter.has(symbol.kind.toLowerCase());

    if (matchesFilter) {
      return { ...symbol, children: filteredChildren };
    }

    // If symbol doesn't match but has matching children, we need to decide
    // whether to include the parent. For now, we only return direct matches
    // and their filtered children.
    return null;
  }

  return symbols
    .map(filterSymbol)
    .filter((s): s is DocumentSymbol => s !== null);
}

/**
 * Filter symbols by line range.
 * A symbol is included if its start line is within the range.
 *
 * @param symbols - Array of symbols to filter
 * @param lineRange - The line range filter
 * @returns Filtered symbols
 */
function filterByLineRange(
  symbols: DocumentSymbol[],
  lineRange: LineRange
): DocumentSymbol[] {
  return symbols.filter(symbol => {
    if (lineRange.start !== undefined && symbol.line < lineRange.start) {
      return false;
    }
    if (lineRange.end !== undefined && symbol.line > lineRange.end) {
      return false;
    }
    return true;
  }).map(symbol => ({
    ...symbol,
    // Also filter children by the same range
    children: filterByLineRange(symbol.children, lineRange),
  }));
}

/**
 * Truncate symbol tree to a maximum depth.
 *
 * @param symbols - Array of symbols to truncate
 * @param maxDepth - Maximum depth (1 = top-level only)
 * @param currentDepth - Current depth in recursion (default: 1)
 * @returns Truncated symbols
 */
function truncateToDepth(
  symbols: DocumentSymbol[],
  maxDepth: number,
  currentDepth: number = 1
): DocumentSymbol[] {
  if (currentDepth >= maxDepth) {
    // At max depth, strip all children
    return symbols.map(s => ({ ...s, children: [] }));
  }

  return symbols.map(s => ({
    ...s,
    children: truncateToDepth(s.children, maxDepth, currentDepth + 1),
  }));
}

/**
 * Apply all filters to a symbol array.
 *
 * @param symbols - Array of symbols
 * @param args - The filter arguments
 * @returns Filtered symbols
 */
function applyFilters(
  symbols: DocumentSymbol[],
  args: GetDocumentSymbolsArgs
): DocumentSymbol[] {
  let result = symbols;

  // Apply kind filter first
  if (args.kind_filter && args.kind_filter.length > 0) {
    result = filterByKind(result, args.kind_filter);
  }

  // Apply line range filter
  if (args.line_range && (args.line_range.start !== undefined || args.line_range.end !== undefined)) {
    result = filterByLineRange(result, args.line_range);
  }

  // Apply depth truncation last
  if (args.max_depth !== undefined && args.max_depth > 0) {
    result = truncateToDepth(result, args.max_depth);
  }

  return result;
}

// =============================================================================
// Single File Processing
// =============================================================================

/**
 * Process a single file and return its symbols.
 *
 * @param filePath - Absolute or relative file path
 * @param args - The tool arguments for filtering
 * @returns Single file result with symbols or error
 */
async function processFile(
  filePath: string,
  args: GetDocumentSymbolsArgs
): Promise<SingleFileResult> {
  const projectRoot = getProjectRoot();

  // Resolve file path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectRoot, filePath);

  // Normalize path separators for cross-platform compatibility
  const normalizedFilePath = absolutePath.replace(/\\/g, '/');
  const relativeFile = makeRelativePath(normalizedFilePath, projectRoot);

  try {
    // Get language service for the file
    const { service, program } = await languageServiceManager.getServiceForFile(
      normalizedFilePath
    );

    // Get the source file for position conversion
    const sourceFile = program.getSourceFile(normalizedFilePath);
    if (!sourceFile) {
      return {
        file: relativeFile,
        symbols: [],
        count: 0,
        error: `Source file not found: ${filePath}`,
      };
    }

    // Get the navigation tree for the document
    const navigationTree = service.getNavigationTree(normalizedFilePath);

    if (!navigationTree) {
      return {
        file: relativeFile,
        symbols: [],
        count: 0,
      };
    }

    // Extract symbols from the navigation tree
    let symbols = extractSymbols(navigationTree, sourceFile);

    // Apply filters
    symbols = applyFilters(symbols, args);

    return {
      file: relativeFile,
      symbols,
      count: symbols.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      file: relativeFile,
      symbols: [],
      count: 0,
      error: message,
    };
  }
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
 * Supports:
 * - Single file mode (backward compatible with `file` parameter)
 * - Batch mode (multiple files with `files` parameter)
 * - Filtering by symbol kind (`kind_filter`)
 * - Filtering by line range (`line_range`)
 * - Depth control (`max_depth`)
 *
 * @param args - The get_document_symbols tool arguments
 * @returns MCP tool response with JSON-formatted symbols
 *
 * @example
 * ```typescript
 * // Single file mode
 * const result = await handleGetDocumentSymbols({
 *   file: 'src/utils.ts'
 * });
 *
 * // Batch mode with filtering
 * const result = await handleGetDocumentSymbols({
 *   files: ['src/a.ts', 'src/b.ts'],
 *   kind_filter: ['function', 'class'],
 *   max_depth: 1,
 *   output_mode: 'minimal'
 * });
 *
 * // Symbols in a specific region
 * const result = await handleGetDocumentSymbols({
 *   file: 'src/auth.ts',
 *   line_range: { start: 50, end: 150 }
 * });
 * ```
 */
export async function handleGetDocumentSymbols(
  args: GetDocumentSymbolsArgs
): Promise<ToolResponse> {
  try {
    // Combine file and files into a single list
    const fileList: string[] = [];
    if (args.file) {
      fileList.push(args.file);
    }
    if (args.files && args.files.length > 0) {
      fileList.push(...args.files);
    }

    // Validate: need at least one file
    if (fileList.length === 0) {
      return createErrorResponse('Missing required argument: file or files');
    }

    const outputMode = args.output_mode ?? 'standard';

    // Determine if this is batch mode (more than one file)
    const isBatchMode = fileList.length > 1;

    // Helper to count all symbols including nested children
    const countAllSymbols = (syms: DocumentSymbol[]): number => {
      return syms.reduce((total, s) => total + 1 + countAllSymbols(s.children), 0);
    };

    // Helper to strip children for non-verbose modes
    const stripChildren = (sym: DocumentSymbol): Omit<DocumentSymbol, 'children'> & { children: never[] } => ({
      name: sym.name,
      kind: sym.kind,
      line: sym.line,
      column: sym.column,
      end_line: sym.end_line,
      end_column: sym.end_column,
      children: [] as never[],
    });

    // Helper to format symbols based on output mode
    const formatSymbols = (symbols: DocumentSymbol[]): unknown[] => {
      if (outputMode === 'minimal') {
        return symbols.map(s => ({ name: s.name, kind: s.kind }));
      }
      if (outputMode === 'verbose') {
        return symbols;
      }
      // Standard mode: symbols with positions but no nested children
      return symbols.map(stripChildren);
    };

    if (isBatchMode) {
      // Batch mode: process all files in parallel
      const results = await Promise.all(
        fileList.map(file => processFile(file, args))
      );

      // Format results based on output mode
      const formattedResults = results.map(r => {
        if (r.error) {
          return {
            file: r.file,
            symbols: [],
            count: 0,
            error: r.error,
          };
        }

        if (outputMode === 'count_only') {
          return {
            file: r.file,
            count: r.count,
            total_including_nested: countAllSymbols(r.symbols),
          };
        }

        return {
          file: r.file,
          symbols: formatSymbols(r.symbols),
          count: r.count,
        };
      });

      const totalSymbols = results.reduce((sum, r) => sum + r.count, 0);

      const batchResult: BatchDocumentSymbolsResult = {
        results: formattedResults as SingleFileResult[],
        total_files: fileList.length,
        total_symbols: totalSymbols,
      };

      return createSuccessResponse(batchResult);
    }

    // Single file mode (backward compatible)
    const result = await processFile(fileList[0], args);

    if (result.error) {
      return createErrorResponse(result.error);
    }

    // Format output based on output_mode
    if (outputMode === 'count_only') {
      return createSuccessResponse({
        file: result.file,
        count: result.count,
        total_including_nested: countAllSymbols(result.symbols),
      });
    }

    const formattedResult: GetDocumentSymbolsResult = {
      symbols: formatSymbols(result.symbols) as DocumentSymbol[],
      file: result.file,
      count: result.count,
    };

    return createSuccessResponse(formattedResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get document symbols: ${message}`);
  }
}
