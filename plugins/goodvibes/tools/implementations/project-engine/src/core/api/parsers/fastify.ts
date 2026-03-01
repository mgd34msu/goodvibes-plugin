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
import { findFilesSync, getLineNumber } from './utils.js';

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

// findFilesSync and getLineNumber are imported from ./utils.js
