/**
 * Hono route parser for the api domain.
 *
 * Parses API route definitions from Hono source files.
 *
 * @module core/api/parsers/hono
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ApiRoute } from '../types.js';

/**
 * Parses Hono route definitions from source files.
 *
 * Scans for `app.get()`, `api.post()`, and `hono.on()` patterns.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of discovered Hono API routes
 */
export function parseHonoRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const srcDir = path.join(projectPath, 'src');
  const searchDirs = fs.existsSync(srcDir) ? [srcDir] : [projectPath];

  for (const dir of searchDirs) {
    const tsFiles = findFilesSync(dir, /\.(ts|js)$/, /node_modules|\.d\.ts$/);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');

      routes.push(...parseHonoFileRoutes(content, relativePath));
    }
  }

  return routes;
}

/**
 * Parses Hono route definitions from a single source file.
 *
 * Matches `app.get('/path', handler)`, `api.get('/path', middleware, handler)`,
 * and `hono.on('METHOD', '/path', handler)` patterns.
 *
 * @param content - Source file content
 * @param filePath - Relative file path for route attribution
 * @returns Array of routes found in the file
 */
export function parseHonoFileRoutes(content: string, filePath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all'];

  for (const method of methods) {
    // Match patterns like:
    // app.get('/path', handler)
    // api.get('/path', middleware, handler)
    // route.get('/path', handler)
    const pattern = new RegExp(
      `(?:app|api|route|router|hono)\\.${method}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'g'
    );

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1];
      const line = getLineNumber(content, match.index);

      routes.push({
        method: method === 'all' ? 'ALL' : method.toUpperCase(),
        path: routePath,
        handler_file: filePath,
        handler_line: line,
      });
    }
  }

  // Check for Hono's on() method for custom methods
  const onPattern = /(?:app|api|route|router|hono)\.on\s*\(\s*['"](\w+)['""],\s*['"]([^'"]+)['"]/g;

  let match;
  while ((match = onPattern.exec(content)) !== null) {
    const method = match[1];
    const routePath = match[2];
    const line = getLineNumber(content, match.index);

    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      handler_file: filePath,
      handler_line: line,
    });
  }

  return routes;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Recursively finds files matching a pattern in a directory (synchronous).
 *
 * @param dir - Directory to search
 * @param includePattern - RegExp pattern that file names must match
 * @param excludePattern - Optional RegExp pattern to exclude files
 * @returns Array of absolute file paths
 */
function findFilesSync(dir: string, includePattern: RegExp, excludePattern?: RegExp): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (excludePattern && excludePattern.test(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'build', '.turbo'].includes(entry.name)) {
        continue;
      }
      files.push(...findFilesSync(fullPath, includePattern, excludePattern));
    } else if (entry.isFile() && includePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Converts a character index to a 1-based line number in source content.
 *
 * @param content - Full source file content
 * @param index - Character index position
 * @returns 1-based line number
 */
function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}
