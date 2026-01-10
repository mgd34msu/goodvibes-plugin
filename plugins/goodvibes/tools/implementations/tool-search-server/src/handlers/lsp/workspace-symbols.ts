/**
 * Workspace Symbols Handler
 *
 * Searches for symbols by name across the entire workspace with semantic awareness.
 * Unlike grep, this distinguishes between a function named `foo` vs a variable named `foo`.
 * Uses TypeScript Language Service's getNavigateToItems() for accurate symbol search.
 *
 * @module handlers/lsp/workspace-symbols
 */

import * as path from 'path';
import * as fs from 'fs';
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
 * Arguments for the workspace_symbols tool.
 */
export interface WorkspaceSymbolsArgs {
  /** Symbol name or partial name to search for */
  query: string;
  /** Filter by symbol kind (default: all) */
  kind?: 'all' | 'class' | 'interface' | 'function' | 'variable' | 'type' | 'enum' | 'method' | 'property' | 'module';
  /** Maximum number of results (default: 50, max: 200) */
  limit?: number;
  /** How to match the query (default: substring) */
  match_type?: 'exact' | 'prefix' | 'substring';
}

/**
 * A workspace symbol with location and metadata.
 */
interface WorkspaceSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind (class, function, interface, variable, etc.) */
  kind: string;
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Name of the containing class/module (if any) */
  container_name: string;
  /** How the symbol matched (exact, prefix, substring) */
  match_kind: string;
}

/**
 * Result of the workspace_symbols tool.
 */
interface WorkspaceSymbolsResult {
  /** Array of matching symbols */
  symbols: WorkspaceSymbol[];
  /** The search query used */
  query: string;
  /** Number of symbols found */
  count: number;
  /** Whether results were truncated due to limit */
  truncated: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed limit */
const MAX_LIMIT = 200;

/** Default limit */
const DEFAULT_LIMIT = 50;

// =============================================================================
// Symbol Kind Mapping
// =============================================================================

/**
 * Map TypeScript ScriptElementKind to human-readable symbol kind names.
 */
function getSymbolKind(kind: ts.ScriptElementKind): string {
  const kindMap: Record<string, string> = {
    [ts.ScriptElementKind.classElement]: 'class',
    [ts.ScriptElementKind.interfaceElement]: 'interface',
    [ts.ScriptElementKind.typeElement]: 'type',
    [ts.ScriptElementKind.enumElement]: 'enum',
    [ts.ScriptElementKind.functionElement]: 'function',
    [ts.ScriptElementKind.localFunctionElement]: 'function',
    [ts.ScriptElementKind.memberFunctionElement]: 'method',
    [ts.ScriptElementKind.memberVariableElement]: 'property',
    [ts.ScriptElementKind.variableElement]: 'variable',
    [ts.ScriptElementKind.localVariableElement]: 'variable',
    [ts.ScriptElementKind.letElement]: 'variable',
    [ts.ScriptElementKind.constElement]: 'constant',
    [ts.ScriptElementKind.parameterElement]: 'parameter',
    [ts.ScriptElementKind.moduleElement]: 'module',
    [ts.ScriptElementKind.alias]: 'alias',
    [ts.ScriptElementKind.memberGetAccessorElement]: 'getter',
    [ts.ScriptElementKind.memberSetAccessorElement]: 'setter',
    [ts.ScriptElementKind.constructorImplementationElement]: 'constructor',
    [ts.ScriptElementKind.enumMemberElement]: 'enum_member',
  };

  return kindMap[kind] ?? kind;
}

/**
 * Get the ScriptElementKind values that match a kind filter.
 */
function getKindFilter(kind: string): ts.ScriptElementKind[] | null {
  if (kind === 'all') return null;

  const kindFilters: Record<string, ts.ScriptElementKind[]> = {
    class: [ts.ScriptElementKind.classElement],
    interface: [ts.ScriptElementKind.interfaceElement],
    function: [ts.ScriptElementKind.functionElement, ts.ScriptElementKind.localFunctionElement],
    variable: [
      ts.ScriptElementKind.variableElement,
      ts.ScriptElementKind.localVariableElement,
      ts.ScriptElementKind.letElement,
      ts.ScriptElementKind.constElement,
    ],
    type: [ts.ScriptElementKind.typeElement],
    enum: [ts.ScriptElementKind.enumElement],
    method: [ts.ScriptElementKind.memberFunctionElement],
    property: [ts.ScriptElementKind.memberVariableElement],
    module: [ts.ScriptElementKind.moduleElement],
  };

  return kindFilters[kind] ?? null;
}

/**
 * Determine match kind based on how the query matches the symbol name.
 */
function getMatchKind(name: string, query: string): 'exact' | 'prefix' | 'substring' {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerName === lowerQuery) return 'exact';
  if (lowerName.startsWith(lowerQuery)) return 'prefix';
  return 'substring';
}

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Find all TypeScript/JavaScript source files in the project.
 */
function findSourceFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo'];

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath.replace(/\\/g, '/'));
          }
        }
      }
    } catch {
      // Ignore permission errors etc.
    }
  }

  walk(projectRoot);
  return files;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the workspace_symbols MCP tool call.
 *
 * Searches for symbols by name across the entire workspace using TypeScript
 * Language Service's getNavigateToItems API.
 *
 * @param args - The workspace_symbols tool arguments
 * @returns MCP tool response with JSON-formatted symbols
 *
 * @example
 * ```typescript
 * const result = await handleWorkspaceSymbols({
 *   query: 'User',
 *   kind: 'class',
 *   limit: 10
 * });
 * // Returns matching class symbols containing "User"
 * ```
 */
export async function handleWorkspaceSymbols(
  args: WorkspaceSymbolsArgs
): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.query || args.query.trim() === '') {
      return createErrorResponse('Missing required argument: query');
    }

    const query = args.query.trim();
    const kindFilter = args.kind ?? 'all';
    const matchType = args.match_type ?? 'substring';
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    // Find a source file to initialize the language service
    // We need at least one file to get the service started
    const sourceFiles = findSourceFiles(PROJECT_ROOT);
    if (sourceFiles.length === 0) {
      return createErrorResponse('No TypeScript/JavaScript source files found in project');
    }

    // Get language service using the first source file
    const { service, program } = await languageServiceManager.getServiceForFile(sourceFiles[0]);

    // Use getNavigateToItems to search for symbols
    // This searches across all files known to the language service
    const navigateToItems = service.getNavigateToItems(
      query,
      MAX_LIMIT * 2, // Request more to account for filtering
      undefined, // Search all files
      false // Don't exclude declaration files
    );

    if (!navigateToItems || navigateToItems.length === 0) {
      const result: WorkspaceSymbolsResult = {
        symbols: [],
        query,
        count: 0,
        truncated: false,
      };
      return createSuccessResponse(result);
    }

    // Get kind filter
    const kindFilterValues = getKindFilter(kindFilter);

    // Convert and filter results
    const symbols: WorkspaceSymbol[] = [];

    for (const item of navigateToItems) {
      // Apply kind filter
      if (kindFilterValues && !kindFilterValues.includes(item.kind)) {
        continue;
      }

      // Apply match type filter
      const itemMatchKind = getMatchKind(item.name, query);
      if (matchType === 'exact' && itemMatchKind !== 'exact') {
        continue;
      }
      if (matchType === 'prefix' && itemMatchKind === 'substring') {
        continue;
      }

      // Get line and column from text span
      const sourceFile = program.getSourceFile(item.fileName);
      let line = 1;
      let column = 1;

      if (sourceFile && item.textSpan) {
        const pos = sourceFile.getLineAndCharacterOfPosition(item.textSpan.start);
        line = pos.line + 1; // Convert to 1-based
        column = pos.character + 1;
      }

      symbols.push({
        name: item.name,
        kind: getSymbolKind(item.kind),
        file: makeRelativePath(item.fileName, PROJECT_ROOT),
        line,
        column,
        container_name: item.containerName ?? '',
        match_kind: itemMatchKind,
      });

      // Stop if we have enough results
      if (symbols.length >= limit) {
        break;
      }
    }

    // Sort results: exact matches first, then prefix, then substring
    // Within each category, sort alphabetically
    symbols.sort((a, b) => {
      const matchOrder = { exact: 0, prefix: 1, substring: 2 };
      const aOrder = matchOrder[a.match_kind as keyof typeof matchOrder] ?? 3;
      const bOrder = matchOrder[b.match_kind as keyof typeof matchOrder] ?? 3;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

    const result: WorkspaceSymbolsResult = {
      symbols,
      query,
      count: symbols.length,
      truncated: navigateToItems.length > limit,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to search workspace symbols: ${message}`);
  }
}
