/**
 * findCircularDeps — L2 extension for the deps domain.
 *
 * Composes L1 core/deps utilities to detect circular import dependencies
 * in the codebase by building an import graph and using DFS to find cycles.
 *
 * @module extensions/deps/circular
 */

import * as node_fs from 'node:fs';
import * as node_path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';

import type { CircularDepsArgs, Cycle } from '../../core/deps/types.js';
import { buildImportGraph, findCycles } from '../../core/deps/graph.js';
import { shouldSkipDirectory } from '../../core/deps/file-utils.js';

/** Supported file extensions for TypeScript/JavaScript */
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Checks if a file is a TypeScript/JavaScript source file based on extension.
 */
function isSourceFile(filePath: string): boolean {
  const ext = node_path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Recursively collects all source files in a directory.
 *
 * @param dir - Directory to scan
 * @param includeNodeModules - Whether to include files in node_modules
 * @returns Array of absolute file paths to source files
 */
function getSourceFiles(dir: string, includeNodeModules: boolean): string[] {
  const files: string[] = [];

  if (!node_fs.existsSync(dir)) {
    return files;
  }

  const entries = node_fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = node_path.join(dir, entry.name);

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
 * Converts an absolute path to a relative path from the project root.
 */
function makeRelativePath(absolutePath: string, projectRoot: string): string {
  const relative = node_path.relative(projectRoot, absolutePath);
  return relative.replace(/\\/g, '/');
}

/** Result of the find_circular_deps tool */
interface FindCircularDepsResult {
  cycles: Cycle[];
  count: number;
  affected_files: string[];
}

/**
 * Detects circular import dependencies in a project directory.
 *
 * Builds an import graph by parsing all source files in the specified
 * directory, then uses DFS to detect and report all circular dependencies.
 *
 * @param args - The find_circular_deps tool arguments
 * @returns MCP tool response with JSON-formatted cycles
 */
export async function findCircularDeps(args: CircularDepsArgs): Promise<McpResponse> {
  try {
    const scanPath = args.path ?? '.';
    const includeNodeModules = args.include_node_modules ?? false;

    // Resolve the scan path
    const absolutePath = node_path.isAbsolute(scanPath)
      ? scanPath
      : node_path.resolve(PROJECT_ROOT, scanPath);

    // Verify the path exists
    if (!node_fs.existsSync(absolutePath)) {
      return fail(`Path does not exist: ${scanPath}`);
    }

    // Get all source files
    const files = getSourceFiles(absolutePath, includeNodeModules);

    if (files.length === 0) {
      const result: FindCircularDepsResult = {
        cycles: [],
        count: 0,
        affected_files: [],
      };
      return ok(result);
    }

    // Build import graph (async, uses parseImports)
    const graph = await buildImportGraph(files);

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
    const relativeCycles: Cycle[] = cycles.map((cycle) => ({
      path: cycle.path.map((p) => makeRelativePath(p, PROJECT_ROOT)),
      length: cycle.length,
    }));

    const affectedFiles = Array.from(affectedSet)
      .map((p) => makeRelativePath(p, PROJECT_ROOT))
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

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to find circular dependencies: ${message}`);
  }
}
