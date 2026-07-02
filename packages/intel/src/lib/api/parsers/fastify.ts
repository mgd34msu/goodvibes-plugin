/**
 * Fastify route parser.
 *
 * Ported near-verbatim from v1 project-engine `core/api/parsers/fastify.ts`.
 *
 * @module lib/api/parsers/fastify
 */

import type { ApiRoute } from '../types.js';
import { getLineNumber } from './utils.js';

/**
 * Parse Fastify route definitions from a single source file.
 *
 * Matches `fastify.get('/path', handler)`, `server.get('/path', { schema }, handler)`,
 * and `fastify.route({ method, url })` patterns.
 *
 * @param content - source file content
 * @param filePath - handler_file path (relative to base_path)
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseFastifyFileRoutes(content: string, filePath: string, resolvedPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

  for (const method of methods) {
    const pattern = new RegExp(`(?:fastify|server|app)\\.${method}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1];
      const line = getLineNumber(content, match.index);
      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler_file: filePath,
        resolved_path: resolvedPath,
        handler_line: line,
      });
    }
  }

  // fastify.route({ method: 'GET', url: '/path' }) — either key order.
  const routePattern =
    /(?:fastify|server|app)\.route\s*\(\s*\{[^}]*method\s*:\s*['"](\w+)['""][^}]*url\s*:\s*['"]([^'"]+)['"]|url\s*:\s*['"]([^'"]+)['""][^}]*method\s*:\s*['"](\w+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(content)) !== null) {
    const method = match[1] || match[4];
    const routePath = match[2] || match[3];
    const line = getLineNumber(content, match.index);
    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      handler_file: filePath,
      resolved_path: resolvedPath,
      handler_line: line,
    });
  }

  return routes;
}
