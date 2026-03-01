/**
 * Fastify route parser for the api domain.
 *
 * Parses API route definitions from Fastify source files.
 *
 * @module core/api/parsers/fastify
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ApiRoute } from '../types.js';

/**
 * Parses Fastify route definitions from source files.
 *
 * Scans for `fastify.get()`, `server.post()`, and `fastify.route()` patterns.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of discovered Fastify API routes
 */
export function parseFastifyRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const srcDir = path.join(projectPath, 'src');
  const searchDirs = fs.existsSync(srcDir) ? [srcDir] : [projectPath];

  for (const dir of searchDirs) {
    const tsFiles = findFilesSync(dir, /\.(ts|js)$/, /node_modules|\.d\.ts$/);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');

      routes.push(...parseFastifyFileRoutes(content, relativePath));
    }
  }

  return routes;
}

/**
 * Parses Fastify route definitions from a single source file.
 *
 * Matches `fastify.get('/path', handler)`, `server.get('/path', { schema: ... }, handler)`,
 * and `fastify.route({ method, url })` patterns.
 *
 * @param content - Source file content
 * @param filePath - Relative file path for route attribution
 * @returns Array of routes found in the file
 */
export function parseFastifyFileRoutes(content: string, filePath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

  for (const method of methods) {
    // Match patterns like:
    // fastify.get('/path', handler)
    // server.get('/path', { schema: ... }, handler)
    // app.get('/path', options, handler)
    const pattern = new RegExp(
      `(?:fastify|server|app)\\.${method}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'g'
    );

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1];
      const line = getLineNumber(content, match.index);

      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler_file: filePath,
        handler_line: line,
      });
    }
  }

  // Also check for fastify.route() pattern
  const routePattern = /(?:fastify|server|app)\.route\s*\(\s*\{[^}]*method\s*:\s*['"](\w+)['""][^}]*url\s*:\s*['"]([^'"]+)['"]|url\s*:\s*['"]([^'"]+)['""][^}]*method\s*:\s*['"](\w+)['"]/g;

  let match;
  while ((match = routePattern.exec(content)) !== null) {
    const method = match[1] || match[4];
    const routePath = match[2] || match[3];
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
