/**
 * Express route parser.
 *
 * Ported near-verbatim from v1 project-engine `core/api/parsers/express.ts`
 * (regex-based route + middleware detection); file discovery moved to the
 * orchestrator (`lib/api/routes.ts`), which rides the shared compiler host.
 *
 * @module lib/api/parsers/express
 */

import type { ApiRoute } from '../types.js';
import { getLineNumber } from './utils.js';

/**
 * Parse Express route definitions from a single source file.
 *
 * Matches patterns like `app.get('/path', handler)` and
 * `router.post('/path', middleware, handler)`.
 *
 * @param content - source file content
 * @param filePath - handler_file path (relative to base_path)
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseExpressFileRoutes(content: string, filePath: string, resolvedPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

  for (const method of methods) {
    // The character class ['"`] matches single quote, double quote, or backtick
    // to support all JS/TS string literal delimiters used for route paths.
    const pattern = new RegExp(`(?:app|router|server)\\.${method}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1];
      const line = getLineNumber(content, match.index);
      const middleware = extractExpressMiddleware(content, match.index);

      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler_file: filePath,
        resolved_path: resolvedPath,
        handler_line: line,
        ...(middleware.length > 0 && { middleware }),
      });
    }
  }

  return routes;
}

/**
 * Extract middleware function names from an Express route definition, using a
 * simple heuristic over the text between the route path and the final
 * handler argument.
 * @param content - full source file content
 * @param startIndex - character index where the route definition starts
 */
export function extractExpressMiddleware(content: string, startIndex: number): string[] {
  const middleware: string[] = [];

  const routeStart = content.indexOf('(', startIndex);
  if (routeStart === -1) {return middleware;}

  const lineEnd = content.indexOf('\n', routeStart);
  const routeLine = content.substring(routeStart, lineEnd > -1 ? lineEnd : undefined);

  const middlewarePattern = /,\s*(\w+)(?=\s*,|\s*\(|\s*\))/g;
  let match: RegExpExecArray | null;
  while ((match = middlewarePattern.exec(routeLine)) !== null) {
    const name = match[1];
    if (!['req', 'res', 'next', 'async', 'function'].includes(name)) {
      middleware.push(name);
    }
  }

  return middleware;
}
