/**
 * Import parsing utilities for the deps domain.
 *
 * Provides functions to extract and resolve import statements from source files.
 *
 * @module core/deps/import-parser
 */

import * as node_fs from 'node:fs/promises';
import * as node_path from 'node:path';

import { IMPORT_PATTERNS } from './constants.js';

/** Supported file extensions for TypeScript/JavaScript resolution */
export const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Extracts external package imports from a source file.
 *
 * Reads the file at `filePath`, then parses ES6 imports, require() calls,
 * and dynamic imports. Skips relative imports and extracts base package
 * names (handles scoped packages).
 *
 * @param filePath - Absolute path to the source file
 * @returns Map of package names to their import count in this file
 */
export async function extractImports(filePath: string): Promise<Map<string, number>> {
  const imports = new Map<string, number>();

  let content: string;
  try {
    content = await node_fs.readFile(filePath, 'utf-8');
  } catch {
    return imports;
  }

  // These patterns differ intentionally from core/deps/constants.ts IMPORT_PATTERNS:
  // - extractImports targets external packages (npm) with broader ES6 import syntax
  // - IMPORT_PATTERNS targets local relative imports for the circular dependency graph
  // Match ES6 imports: import ... from 'package'
  const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"]([^'"]+)['"]/g;

  // Match require statements: require('package')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  // Match dynamic imports: import('package')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const addImport = (pkg: string) => {
    // Skip relative imports
    if (pkg.startsWith('.') || pkg.startsWith('/')) {
      return;
    }

    // Extract base package name (handle scoped packages)
    let basePkg: string;
    if (pkg.startsWith('@')) {
      // Scoped package: @scope/package/subpath -> @scope/package
      const parts = pkg.split('/');
      basePkg = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : pkg;
    } else {
      // Regular package: package/subpath -> package
      basePkg = pkg.split('/')[0];
    }

    imports.set(basePkg, (imports.get(basePkg) || 0) + 1);
  };

  let match: RegExpExecArray | null;

  while ((match = es6ImportRegex.exec(content)) !== null) {
    addImport(match[1]);
  }

  while ((match = requireRegex.exec(content)) !== null) {
    addImport(match[1]);
  }

  while ((match = dynamicImportRegex.exec(content)) !== null) {
    addImport(match[1]);
  }

  return imports;
}

/**
 * Parses import statements from a source file to find local file dependencies.
 *
 * Extracts ES6 imports, re-exports, dynamic imports, and CommonJS requires.
 * Only returns imports that resolve to files in the provided set.
 *
 * @param filePath - Absolute path to the file to parse
 * @param allFiles - Set of all source files for resolution (normalized paths)
 * @returns Array of resolved absolute file paths that this file imports
 */
export async function parseImports(filePath: string, allFiles: Set<string>): Promise<string[]> {
  const imports: string[] = [];

  let content: string;
  try {
    content = await node_fs.readFile(filePath, 'utf-8');
  } catch {
    return imports;
  }

  const fileDir = node_path.dirname(filePath);
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
 * Resolves an import path to an absolute file path.
 *
 * Handles various resolution strategies:
 * - Exact path with extension
 * - Path with implicit extension (.ts, .tsx, .js, etc.)
 * - Directory index files (index.ts, index.js, etc.)
 * - .js imports that map to .ts files
 *
 * @param importPath - Import path from source (e.g., './utils', '../lib/helpers')
 * @param fromDir - Directory containing the importing file
 * @param allFiles - Set of all known source files for validation
 * @returns Resolved absolute path, or null if not found in allFiles
 */
export function resolveImportPath(
  importPath: string,
  fromDir: string,
  allFiles: Set<string>
): string | null {
  // Start with the basic resolution
  const basePath = node_path.resolve(fromDir, importPath);
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
