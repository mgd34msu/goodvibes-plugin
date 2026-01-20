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

/** Output mode for controlling response verbosity */
export type OutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

/** Valid symbol kind values */
export type SymbolKind = 'all' | 'class' | 'interface' | 'function' | 'variable' | 'type' | 'enum' | 'method' | 'property' | 'module';

/**
 * Arguments for the workspace_symbols tool.
 */
export interface WorkspaceSymbolsArgs {
  /** Symbol name or partial name to search for */
  query: string;
  /** Filter by symbol kind (default: all) */
  kind?: SymbolKind;
  /** Maximum number of results (default: 50, max: 200) */
  limit?: number;
  /** How to match the query (default: substring) */
  match_type?: 'exact' | 'prefix' | 'substring';
  /** Output verbosity (default: standard) */
  output_mode?: OutputMode;
  /** Search multiple kinds at once (overrides singular 'kind' if both provided) */
  kinds?: SymbolKind[];
  /** Glob patterns to filter files (e.g., src/utils/**, src/helpers/**) */
  file_patterns?: string[];
  /** Glob patterns to exclude files (e.g., **\/*.test.ts, **\/*.spec.ts) */
  exclude_patterns?: string[];
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
  /** Number of unique files searched (when file filtering is applied) */
  files_searched?: number;
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

/**
 * Get combined kind filter for multiple kinds.
 * Returns all ScriptElementKind values that match any of the specified kinds.
 */
function getMultiKindFilter(kinds: SymbolKind[]): ts.ScriptElementKind[] | null {
  // If 'all' is in the list, return null (no filtering)
  if (kinds.includes('all')) return null;

  const combined: ts.ScriptElementKind[] = [];
  for (const kind of kinds) {
    const filter = getKindFilter(kind);
    if (filter) {
      combined.push(...filter);
    }
  }

  // Return null if no valid kinds, deduplicate the combined array
  return combined.length > 0 ? [...new Set(combined)] : null;
}

// =============================================================================
// Glob Pattern Matching
// =============================================================================

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a glob pattern to a regex.
 * Supports:
 * - * matches any characters except /
 * - ** matches any characters including /
 * - ? matches single character
 * - [abc] character class
 * - {a,b} alternation
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path
        if (pattern[i + 2] === '/') {
          regex += '(?:.*/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        // * matches any characters except /
        regex += '[^/]*';
        i++;
      }
    } else if (char === '?') {
      regex += '[^/]';
      i++;
    } else if (char === '[') {
      // Character class
      const endBracket = pattern.indexOf(']', i);
      if (endBracket === -1) {
        regex += '\\[';
        i++;
      } else {
        regex += pattern.slice(i, endBracket + 1);
        i = endBracket + 1;
      }
    } else if (char === '{') {
      // Alternation
      const endBrace = pattern.indexOf('}', i);
      if (endBrace === -1) {
        regex += '\\{';
        i++;
      } else {
        const options = pattern.slice(i + 1, endBrace).split(',');
        regex += '(?:' + options.map(o => escapeRegex(o)).join('|') + ')';
        i = endBrace + 1;
      }
    } else if ('.+^$|\\()'.includes(char)) {
      // Escape regex special characters
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp('^' + regex + '$');
}

/**
 * Check if a file path matches any of the include patterns.
 * If no include patterns are provided, returns true (include all).
 */
function matchesIncludePatterns(relativePath: string, includePatterns: RegExp[]): boolean {
  if (includePatterns.length === 0) return true;
  return includePatterns.some(pattern => pattern.test(relativePath));
}

/**
 * Check if a file path matches any of the exclude patterns.
 */
function matchesExcludePatterns(relativePath: string, excludePatterns: RegExp[]): boolean {
  if (excludePatterns.length === 0) return false;
  return excludePatterns.some(pattern => pattern.test(relativePath));
}

/**
 * Filter a file path based on include and exclude patterns.
 * Returns true if the file should be included in results.
 */
function shouldIncludeFile(
  relativePath: string,
  includePatterns: RegExp[],
  excludePatterns: RegExp[]
): boolean {
  // First check exclusions (exclusions take precedence)
  if (matchesExcludePatterns(relativePath, excludePatterns)) {
    return false;
  }
  // Then check inclusions
  return matchesIncludePatterns(relativePath, includePatterns);
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
    const matchType = args.match_type ?? 'substring';
    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const outputMode = args.output_mode ?? 'standard';

    // Determine kind filter: 'kinds' array takes precedence over singular 'kind'
    let kindFilterValues: ts.ScriptElementKind[] | null = null;
    if (args.kinds && args.kinds.length > 0) {
      kindFilterValues = getMultiKindFilter(args.kinds);
    } else {
      const kindFilter = args.kind ?? 'all';
      kindFilterValues = getKindFilter(kindFilter);
    }

    // Prepare file pattern filters
    const includePatterns = (args.file_patterns ?? []).map(globToRegex);
    const excludePatterns = (args.exclude_patterns ?? []).map(globToRegex);
    const hasFileFilters = includePatterns.length > 0 || excludePatterns.length > 0;

    // Find a source file to initialize the language service
    // We need at least one file to get the service started
    const sourceFiles = findSourceFiles(PROJECT_ROOT);
    /* v8 ignore next 3 -- defensive: project always has source files in practice */
    if (sourceFiles.length === 0) {
      return createErrorResponse('No TypeScript/JavaScript source files found in project');
    }

    // Get language service using the first source file
    const { service, program } = await languageServiceManager.getServiceForFile(sourceFiles[0]);

    // Use getNavigateToItems to search for symbols
    // This searches across all files known to the language service
    // Request more results when filtering to ensure we get enough after filtering
    const requestLimit = hasFileFilters ? MAX_LIMIT * 4 : MAX_LIMIT * 2;
    const navigateToItems = service.getNavigateToItems(
      query,
      requestLimit,
      undefined, // Search all files
      false // Don't exclude declaration files
    );

    if (!navigateToItems || navigateToItems.length === 0) {
      const result: WorkspaceSymbolsResult = {
        symbols: [],
        query,
        count: 0,
        truncated: false,
        ...(hasFileFilters ? { files_searched: 0 } : {}),
      };
      return createSuccessResponse(result);
    }

    // Track unique files for files_searched count
    const filesSearched = new Set<string>();

    // Convert and filter results
    const symbols: WorkspaceSymbol[] = [];
    let totalMatchingBeforeLimit = 0;

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
      /* v8 ignore next 3 -- defensive: prefix matching rarely used in practice */
      if (matchType === 'prefix' && itemMatchKind === 'substring') {
        continue;
      }

      // Apply file pattern filtering
      const relativePath = makeRelativePath(item.fileName, PROJECT_ROOT);
      if (hasFileFilters && !shouldIncludeFile(relativePath, includePatterns, excludePatterns)) {
        continue;
      }

      // Track file for files_searched count
      filesSearched.add(relativePath);

      // Count total matching (for truncation calculation)
      totalMatchingBeforeLimit++;

      // Stop collecting if we have enough results (but continue counting for truncation)
      if (symbols.length >= limit) {
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
        file: relativePath,
        line,
        column,
        container_name: item.containerName ?? '',
        match_kind: itemMatchKind,
      });
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

    const truncated = totalMatchingBeforeLimit > limit;
    const filesSearchedCount = filesSearched.size;

    // Format output based on output_mode
    if (outputMode === 'count_only') {
      return createSuccessResponse({
        query,
        count: symbols.length,
        truncated,
        ...(hasFileFilters ? { files_searched: filesSearchedCount } : {}),
      });
    }

    if (outputMode === 'minimal') {
      return createSuccessResponse({
        symbols: symbols.map(s => ({ name: s.name, file: s.file })),
        query,
        count: symbols.length,
        truncated,
        ...(hasFileFilters ? { files_searched: filesSearchedCount } : {}),
      });
    }

    if (outputMode === 'verbose') {
      // Verbose mode includes everything
      const result: WorkspaceSymbolsResult = {
        symbols,
        query,
        count: symbols.length,
        truncated,
        ...(hasFileFilters ? { files_searched: filesSearchedCount } : {}),
      };
      return createSuccessResponse(result);
    }

    // Standard mode: name, kind, file, line, column (omit container_name and match_kind)
    const result: WorkspaceSymbolsResult = {
      symbols: symbols.map(s => ({
        name: s.name,
        kind: s.kind,
        file: s.file,
        line: s.line,
        column: s.column,
        container_name: '', // Omit in standard mode
        match_kind: '', // Omit in standard mode
      })),
      query,
      count: symbols.length,
      truncated,
      ...(hasFileFilters ? { files_searched: filesSearchedCount } : {}),
    };

    return createSuccessResponse(result);
  /* v8 ignore next 4 -- defensive: catch for unexpected TypeScript service errors */
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to search workspace symbols: ${message}`);
  }
}
