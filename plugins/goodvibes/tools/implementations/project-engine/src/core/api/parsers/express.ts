/**
 * Express route parser for the api domain.
 *
 * Parses API route definitions from Express.js source files.
 *
 * @module core/api/parsers/express
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ApiRoute } from '../types.js';

/**
 * Parses Express.js route definitions from source files.
 *
 * Scans for `app.get()`, `router.post()`, etc. patterns in TypeScript/JavaScript files.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of discovered Express API routes
 */
export function parseExpressRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const srcDir = path.join(projectPath, 'src');
  const searchDirs = fs.existsSync(srcDir) ? [srcDir] : [projectPath];

  for (const dir of searchDirs) {
    const tsFiles = findFilesSync(dir, /\.(ts|js)$/, /node_modules|\.d\.ts$/);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');

      routes.push(...parseExpressFileRoutes(content, relativePath));
    }
  }

  return routes;
}

/**
 * Parses Express route definitions from a single source file.
 *
 * Matches patterns like `app.get('/path', handler)` and
 * `router.post('/path', middleware, handler)`.
 *
 * @param content - Source file content
 * @param filePath - Relative file path for route attribution
 * @returns Array of routes found in the file
 */
export function parseExpressFileRoutes(content: string, filePath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

  for (const method of methods) {
    // Match patterns like:
    // app.get('/path', handler)
    // router.get('/path', middleware, handler)
    // app.get('/path', [middleware], handler)
    const pattern = new RegExp(
      `(?:app|router|server)\\.${method}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'g'
    );

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1];
      const line = getLineNumber(content, match.index);

      // Try to extract middleware from the route definition
      const middleware = extractExpressMiddleware(content, match.index);

      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler_file: filePath,
        handler_line: line,
        ...(middleware.length > 0 && { middleware }),
      });
    }
  }

  return routes;
}

/**
 * Extracts middleware function names from an Express route definition.
 *
 * Uses a simple heuristic to identify middleware names between the route
 * path and the final handler argument.
 *
 * @param content - Full source file content
 * @param startIndex - Character index where the route definition starts
 * @returns Array of middleware function names
 */
export function extractExpressMiddleware(content: string, startIndex: number): string[] {
  const middleware: string[] = [];

  // Find the full route definition (up to the closing parenthesis of the handler)
  const routeStart = content.indexOf('(', startIndex);
  if (routeStart === -1) return middleware;

  // Get text from route path to end of line (simple heuristic)
  const lineEnd = content.indexOf('\n', routeStart);
  const routeLine = content.substring(routeStart, lineEnd > -1 ? lineEnd : undefined);

  // Look for middleware function names between path and handler
  const middlewarePattern = /,\s*(\w+)(?=\s*,|\s*\(|\s*\))/g;
  let match;

  while ((match = middlewarePattern.exec(routeLine)) !== null) {
    const name = match[1];
    // Skip common handler names and arrow function starts
    if (!['req', 'res', 'next', 'async', 'function'].includes(name)) {
      middleware.push(name);
    }
  }

  return middleware;
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
