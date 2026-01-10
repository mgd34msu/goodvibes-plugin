/**
 * Find Circular Dependencies Handler
 *
 * Detects circular import dependencies in the codebase by building an import graph
 * and using DFS to find cycles.
 *
 * @module handlers/deps/circular
 */

import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the find_circular_deps tool.
 */
export interface FindCircularDepsArgs {
  /** Directory to scan (relative to project root or absolute) */
  path?: string;
  /** Include node_modules in scan (default: false) */
  include_node_modules?: boolean;
}

/**
 * A cycle in the import graph.
 */
interface Cycle {
  /** Files forming the cycle (first file repeated at end) */
  path: string[];
  /** Number of unique files in the cycle */
  length: number;
}

/**
 * Result of the find_circular_deps tool.
 */
interface FindCircularDepsResult {
  /** All cycles detected */
  cycles: Cycle[];
  /** Total number of cycles */
  count: number;
  /** All files involved in at least one cycle */
  affected_files: string[];
}

/**
 * Standard MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Create a successful MCP tool response with JSON content.
 */
function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error MCP tool response.
 */
function createErrorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Import Graph Building
// =============================================================================

/** Supported file extensions for TypeScript/JavaScript */
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

/** Directories to always skip */
const SKIP_DIRECTORIES = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out'];

/**
 * Check if a file is a TypeScript/JavaScript source file.
 */
function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Check if a directory should be skipped.
 */
function shouldSkipDirectory(dirName: string, includeNodeModules: boolean): boolean {
  if (dirName === 'node_modules') {
    return !includeNodeModules;
  }
  return SKIP_DIRECTORIES.includes(dirName);
}

/**
 * Get all source files in a directory recursively.
 */
function getSourceFiles(dir: string, includeNodeModules: boolean): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name, includeNodeModules)) {
        files.push(...getSourceFiles(fullPath, includeNodeModules));
      }
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Regular expressions for detecting import statements.
 */
const IMPORT_PATTERNS = [
  // ES6 imports: import ... from '...'
  /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
  // ES6 re-exports: export ... from '...'
  /export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
  // Dynamic imports: import('...')
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CommonJS require: require('...')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Parse imports from a source file.
 * Returns an array of resolved absolute file paths.
 */
function parseImports(filePath: string, allFiles: Set<string>): string[] {
  const imports: string[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return imports;
  }

  const fileDir = path.dirname(filePath);
  const foundImports = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];

      // Skip external packages (not relative paths)
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        continue;
      }

      // Resolve the import path
      const resolvedPath = resolveImportPath(importPath, fileDir, allFiles);
      if (resolvedPath && !foundImports.has(resolvedPath)) {
        foundImports.add(resolvedPath);
        imports.push(resolvedPath);
      }
    }
  }

  return imports;
}

/**
 * Resolve an import path to an absolute file path.
 */
function resolveImportPath(
  importPath: string,
  fromDir: string,
  allFiles: Set<string>
): string | null {
  // Start with the basic resolution
  const basePath = path.resolve(fromDir, importPath);
  const normalizedBase = basePath.replace(/\\/g, '/');

  // Try exact path first (for explicit extensions)
  if (allFiles.has(normalizedBase)) {
    return normalizedBase;
  }

  // Try adding each supported extension
  for (const ext of SUPPORTED_EXTENSIONS) {
    const withExt = normalizedBase + ext;
    if (allFiles.has(withExt)) {
      return withExt;
    }
  }

  // Try index files in directory
  for (const ext of SUPPORTED_EXTENSIONS) {
    const indexPath = normalizedBase + '/index' + ext;
    if (allFiles.has(indexPath)) {
      return indexPath;
    }
  }

  // Handle .js extension in imports that might refer to .ts files
  if (normalizedBase.endsWith('.js')) {
    const withoutJs = normalizedBase.slice(0, -3);
    for (const ext of ['.ts', '.tsx']) {
      if (allFiles.has(withoutJs + ext)) {
        return withoutJs + ext;
      }
    }
  }

  return null;
}

/**
 * Build an import graph from all source files.
 * Returns a map of file -> array of files it imports.
 */
function buildImportGraph(
  files: string[]
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const fileSet = new Set(files.map(f => f.replace(/\\/g, '/')));

  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/');
    const imports = parseImports(file, fileSet);
    graph.set(normalizedFile, imports);
  }

  return graph;
}

// =============================================================================
// Cycle Detection
// =============================================================================

/** Colors for DFS cycle detection */
enum Color {
  WHITE = 0, // Not visited
  GRAY = 1,  // Currently visiting (in stack)
  BLACK = 2, // Finished visiting
}

/**
 * Find all cycles in the import graph using DFS.
 * Uses a color-based approach to detect back edges.
 */
function findCycles(graph: Map<string, string[]>): Cycle[] {
  const cycles: Cycle[] = [];
  const color = new Map<string, Color>();
  const parent = new Map<string, string>();
  const cycleSignatures = new Set<string>();

  // Initialize all nodes as WHITE
  for (const node of graph.keys()) {
    color.set(node, Color.WHITE);
  }

  /**
   * DFS to find cycles - marks back edges and reconstructs cycle paths.
   */
  function dfs(node: string, stack: string[]): void {
    color.set(node, Color.GRAY);
    stack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      // Only consider neighbors that are in our graph
      if (!graph.has(neighbor)) {
        continue;
      }

      const neighborColor = color.get(neighbor);

      if (neighborColor === Color.WHITE) {
        parent.set(neighbor, node);
        dfs(neighbor, stack);
      } else if (neighborColor === Color.GRAY) {
        // Found a back edge - we have a cycle
        const cycle = extractCycle(stack, neighbor);
        if (cycle) {
          // Create a canonical signature to avoid duplicate cycles
          const signature = createCycleSignature(cycle);
          if (!cycleSignatures.has(signature)) {
            cycleSignatures.add(signature);
            cycles.push({
              path: [...cycle, cycle[0]], // Add first file at end to show complete cycle
              length: cycle.length,
            });
          }
        }
      }
    }

    color.set(node, Color.BLACK);
    stack.pop();
  }

  // Run DFS from each unvisited node
  for (const node of graph.keys()) {
    if (color.get(node) === Color.WHITE) {
      dfs(node, []);
    }
  }

  return cycles;
}

/**
 * Extract the cycle from the current DFS stack.
 */
function extractCycle(stack: string[], cycleStart: string): string[] | null {
  const cycleStartIndex = stack.indexOf(cycleStart);
  if (cycleStartIndex === -1) {
    return null;
  }
  return stack.slice(cycleStartIndex);
}

/**
 * Create a canonical signature for a cycle to detect duplicates.
 * The signature is the smallest rotation of the sorted cycle path.
 */
function createCycleSignature(cycle: string[]): string {
  if (cycle.length === 0) return '';

  // Find the minimum element
  let minIndex = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIndex]) {
      minIndex = i;
    }
  }

  // Rotate the cycle to start with the minimum element
  const rotated = [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
  return rotated.join(' -> ');
}

/**
 * Make a path relative to the project root.
 */
function makeRelativePath(absolutePath: string, projectRoot: string): string {
  const relative = path.relative(projectRoot, absolutePath);
  return relative.replace(/\\/g, '/');
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the find_circular_deps MCP tool call.
 *
 * Builds an import graph by parsing all source files in the specified directory,
 * then uses DFS to detect and report all circular dependencies.
 *
 * @param args - The find_circular_deps tool arguments
 * @returns MCP tool response with JSON-formatted cycles
 *
 * @example
 * ```typescript
 * const result = await handleFindCircularDeps({
 *   path: 'src',
 *   include_node_modules: false
 * });
 * // Returns cycles with paths and affected files
 * ```
 */
export async function handleFindCircularDeps(
  args: FindCircularDepsArgs
): Promise<ToolResponse> {
  try {
    const scanPath = args.path ?? '.';
    const includeNodeModules = args.include_node_modules ?? false;

    // Resolve the scan path
    const absolutePath = path.isAbsolute(scanPath)
      ? scanPath
      : path.resolve(PROJECT_ROOT, scanPath);

    // Verify the path exists
    if (!fs.existsSync(absolutePath)) {
      return createErrorResponse(`Path does not exist: ${scanPath}`);
    }

    // Get all source files
    const files = getSourceFiles(absolutePath, includeNodeModules);

    if (files.length === 0) {
      const result: FindCircularDepsResult = {
        cycles: [],
        count: 0,
        affected_files: [],
      };
      return createSuccessResponse(result);
    }

    // Build import graph
    const graph = buildImportGraph(files);

    // Find cycles
    const cycles = findCycles(graph);

    // Collect all affected files
    const affectedSet = new Set<string>();
    for (const cycle of cycles) {
      // Use cycle.path minus the last element (which is a duplicate of the first)
      for (let i = 0; i < cycle.path.length - 1; i++) {
        affectedSet.add(cycle.path[i]);
      }
    }

    // Convert paths to relative paths for output
    const relativeCycles: Cycle[] = cycles.map(cycle => ({
      path: cycle.path.map(p => makeRelativePath(p, PROJECT_ROOT)),
      length: cycle.length,
    }));

    const affectedFiles = Array.from(affectedSet)
      .map(p => makeRelativePath(p, PROJECT_ROOT))
      .sort();

    // Sort cycles by length (shorter cycles first) then by first file
    relativeCycles.sort((a, b) => {
      if (a.length !== b.length) {
        return a.length - b.length;
      }
      return a.path[0].localeCompare(b.path[0]);
    });

    const result: FindCircularDepsResult = {
      cycles: relativeCycles,
      count: relativeCycles.length,
      affected_files: affectedFiles,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to find circular dependencies: ${message}`);
  }
}
