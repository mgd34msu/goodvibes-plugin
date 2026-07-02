/**
 * Next.js route parser (App Router + Pages Router conventions).
 *
 * Ported from v1 project-engine `core/api/parsers/nextjs.ts`. Directory
 * discovery (locating `app/api` / `pages/api`, optionally under `src/`) moved
 * to the orchestrator (`lib/api/routes.ts`); these functions parse ONE
 * already-discovered file, matching the per-file shape of the other three
 * framework parsers.
 *
 * @module lib/api/parsers/nextjs
 */

import type { ApiRoute } from '../types.js';
import { getLineNumber } from './utils.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/**
 * Parse one App Router `route.ts` file for exported HTTP method handlers.
 *
 * Matches `export async function GET(...)`, `export function GET(...)`, and
 * `export const GET = ...`.
 *
 * @param content - source file content
 * @param filePath - handler_file path (relative to base_path), e.g. 'app/api/users/[id]/route.ts'
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseNextJsAppRouterFile(content: string, filePath: string, resolvedPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const routePath = extractNextJsRoutePath(filePath);

  for (const method of HTTP_METHODS) {
    const patterns = [
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`, 'gm'),
      new RegExp(`export\\s+const\\s+${method}\\s*=`, 'gm'),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        const line = getLineNumber(content, match.index);
        routes.push({
          method,
          path: routePath,
          handler_file: filePath,
          resolved_path: resolvedPath,
          handler_line: line,
        });
        break; // only add once per method
      }
    }
  }

  return routes;
}

/**
 * Parse one Pages Router `pages/api/*` file. Pages Router uses a single
 * default-export handler that checks `req.method` internally, so the methods
 * handled are detected heuristically.
 *
 * @param content - source file content
 * @param filePath - handler_file path (relative to base_path), e.g. 'pages/api/users/[id].ts'
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseNextJsPagesRouterFile(content: string, filePath: string, resolvedPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const routePath = extractNextJsPagesRoutePath(filePath);

  const defaultExportMatch = /export\s+default\s+(?:async\s+)?function/.exec(content);
  if (!defaultExportMatch) return routes;

  const line = getLineNumber(content, defaultExportMatch.index);
  const methods = detectPagesRouterMethods(content);

  for (const method of methods) {
    routes.push({
      method,
      path: routePath,
      handler_file: filePath,
      resolved_path: resolvedPath,
      handler_line: line,
    });
  }

  return routes;
}

/**
 * Detect which HTTP methods a Next.js Pages Router handler handles, from
 * `req.method` comparisons / switch cases. Defaults to `['GET']`.
 * @param content - source file content
 */
export function detectPagesRouterMethods(content: string): string[] {
  const methods: string[] = [];
  const methodPatterns = [
    { method: 'GET', pattern: /req\.method\s*===?\s*['"]GET['"]|case\s*['"]GET['"]/ },
    { method: 'POST', pattern: /req\.method\s*===?\s*['"]POST['"]|case\s*['"]POST['"]/ },
    { method: 'PUT', pattern: /req\.method\s*===?\s*['"]PUT['"]|case\s*['"]PUT['"]/ },
    { method: 'DELETE', pattern: /req\.method\s*===?\s*['"]DELETE['"]|case\s*['"]DELETE['"]/ },
    { method: 'PATCH', pattern: /req\.method\s*===?\s*['"]PATCH['"]|case\s*['"]PATCH['"]/ },
  ];

  for (const { method, pattern } of methodPatterns) {
    if (pattern.test(content)) methods.push(method);
  }
  if (methods.length === 0) methods.push('GET');
  return methods;
}

/**
 * Extract the URL route path from a Next.js App Router file path.
 * @param filePath - relative file path, e.g. 'app/api/users/[id]/route.ts'
 * @returns URL path, e.g. '/api/users/[id]'
 */
export function extractNextJsRoutePath(filePath: string): string {
  let routePath = filePath.replace(/^(src\/)?app/, '').replace(/\/route\.(ts|tsx|js|jsx)$/, '');
  if (!routePath.startsWith('/')) routePath = '/' + routePath;
  return routePath || '/';
}

/**
 * Extract the URL route path from a Next.js Pages Router file path.
 * @param filePath - relative file path, e.g. 'pages/api/users/[id].ts'
 * @returns URL path, e.g. '/api/users/[id]'
 */
export function extractNextJsPagesRoutePath(filePath: string): string {
  let routePath = filePath.replace(/^(src\/)?pages/, '').replace(/\.(ts|tsx|js|jsx)$/, '');
  routePath = routePath.replace(/\/index$/, '') || '/';
  if (!routePath.startsWith('/')) routePath = '/' + routePath;
  return routePath;
}
