/**
 * Hono route parser.
 *
 * Ported near-verbatim from v1 project-engine `core/api/parsers/hono.ts`.
 *
 * @module lib/api/parsers/hono
 */

import type { ApiRoute } from '../types.js';
import { getLineNumber } from './utils.js';

/**
 * Parse Hono route definitions from a single source file.
 *
 * Matches `app.get('/path', handler)`, `api.get('/path', middleware, handler)`,
 * and `hono.on('METHOD', '/path', handler)` patterns.
 *
 * @param content - source file content
 * @param filePath - handler_file path (relative to base_path)
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseHonoFileRoutes(content: string, filePath: string, resolvedPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all'];

  for (const method of methods) {
    const pattern = new RegExp(`(?:app|api|route|router|hono)\\.${method}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1];
      const line = getLineNumber(content, match.index);
      routes.push({
        method: method === 'all' ? 'ALL' : method.toUpperCase(),
        path: routePath,
        handler_file: filePath,
        resolved_path: resolvedPath,
        handler_line: line,
      });
    }
  }

  // Hono's on() for custom methods: app.on('PURGE', '/path', handler)
  const onPattern = /(?:app|api|route|router|hono)\.on\s*\(\s*['"](\w+)['""],\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = onPattern.exec(content)) !== null) {
    const method = match[1];
    const routePath = match[2];
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
