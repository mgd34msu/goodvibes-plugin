/**
 * Next.js route parser for the api domain.
 *
 * Parses API route definitions from Next.js App Router and Pages Router conventions.
 *
 * @module core/api/parsers/nextjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ApiRoute } from '../types.js';
import { findFilesSync, getLineNumber } from './utils.js';

/**
 * Parses Next.js API routes from both App Router and Pages Router conventions.
 *
 * Looks for `app/api` and `src/app/api` (App Router) and `pages/api` and
 * `src/pages/api` (Pages Router) directories.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Array of API routes found in app/api and pages/api directories
 */
export function parseNextJsRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];

  // App Router: app/api/**/route.ts
  const srcAppApiDir = path.join(projectPath, 'src', 'app', 'api');
  const appApiDir = path.join(projectPath, 'app', 'api');

  if (fs.existsSync(srcAppApiDir)) {
    routes.push(...parseNextJsAppRouter(srcAppApiDir, projectPath));
  } else if (fs.existsSync(appApiDir)) {
    routes.push(...parseNextJsAppRouter(appApiDir, projectPath));
  }

  // Pages Router: pages/api/**/*.ts
  const srcPagesApiDir = path.join(projectPath, 'src', 'pages', 'api');
  const pagesApiDir = path.join(projectPath, 'pages', 'api');

  if (fs.existsSync(srcPagesApiDir)) {
    routes.push(...parseNextJsPagesRouter(srcPagesApiDir, projectPath));
  } else if (fs.existsSync(pagesApiDir)) {
    routes.push(...parseNextJsPagesRouter(pagesApiDir, projectPath));
  }

  return routes;
}

/**
 * Parses Next.js App Router API routes from route.ts files.
 *
 * Looks for exported HTTP method handlers (GET, POST, PUT, DELETE, etc.) in route files.
 *
 * @param apiDir - Path to the app/api directory
 * @param projectPath - Project root for computing relative paths
 * @returns Array of API routes with methods and handler locations
 */
export function parseNextJsAppRouter(apiDir: string, projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const routeFiles = findFilesSync(apiDir, /route\.(ts|tsx|js|jsx)$/);

  for (const routeFile of routeFiles) {
    const content = fs.readFileSync(routeFile, 'utf-8');
    const relativePath = path.relative(projectPath, routeFile).replace(/\\/g, '/');

    // Extract route path from file location
    // e.g., app/api/users/[id]/route.ts -> /api/users/[id]
    const routePath = extractNextJsRoutePath(relativePath);

    // Find exported HTTP method handlers
    const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

    for (const method of httpMethods) {
      // Match: export async function GET, export function GET, export const GET
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
            handler_file: relativePath,
            handler_line: line,
          });
          break; // Only add once per method
        }
      }
    }
  }

  return routes;
}

/**
 * Parses Next.js Pages Router API routes from pages/api files.
 *
 * Pages Router uses default export handlers that check req.method internally.
 *
 * @param apiDir - Path to the pages/api directory
 * @param projectPath - Project root for computing relative paths
 * @returns Array of API routes with detected HTTP methods
 */
export function parseNextJsPagesRouter(apiDir: string, projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const apiFiles = findFilesSync(apiDir, /\.(ts|tsx|js|jsx)$/, /route\.(ts|tsx|js|jsx)$/);

  for (const apiFile of apiFiles) {
    const content = fs.readFileSync(apiFile, 'utf-8');
    const relativePath = path.relative(projectPath, apiFile).replace(/\\/g, '/');

    // Extract route path from file location
    // e.g., pages/api/users/[id].ts -> /api/users/[id]
    const routePath = extractNextJsPagesRoutePath(relativePath);

    // Pages Router uses default export handler
    const defaultExportMatch = /export\s+default\s+(?:async\s+)?function/.exec(content);

    if (defaultExportMatch) {
      const line = getLineNumber(content, defaultExportMatch.index);

      // Try to detect which methods are handled
      const methods = detectPagesRouterMethods(content);

      for (const method of methods) {
        routes.push({
          method,
          path: routePath,
          handler_file: relativePath,
          handler_line: line,
        });
      }
    }
  }

  return routes;
}

/**
 * Detects which HTTP methods are handled in a Next.js Pages Router handler.
 *
 * Looks for req.method comparisons and switch case statements.
 *
 * @param content - Source file content to analyze
 * @returns Array of HTTP method strings; defaults to ['GET'] if none detected
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
    if (pattern.test(content)) {
      methods.push(method);
    }
  }

  // If no specific methods detected, assume GET (default behavior)
  if (methods.length === 0) {
    methods.push('GET');
  }

  return methods;
}

/**
 * Extracts the URL route path from a Next.js App Router file path.
 *
 * @param filePath - Relative file path (e.g., 'app/api/users/[id]/route.ts')
 * @returns URL path (e.g., '/api/users/[id]')
 */
export function extractNextJsRoutePath(filePath: string): string {
  // Remove app/ or src/app/ prefix and route.ts suffix
  let routePath = filePath
    .replace(/^(src\/)?app/, '')
    .replace(/\/route\.(ts|tsx|js|jsx)$/, '');

  // Ensure path starts with /
  if (!routePath.startsWith('/')) {
    routePath = '/' + routePath;
  }

  return routePath || '/';
}

/**
 * Extracts the URL route path from a Next.js Pages Router file path.
 *
 * @param filePath - Relative file path (e.g., 'pages/api/users/[id].ts')
 * @returns URL path (e.g., '/api/users/[id]')
 */
export function extractNextJsPagesRoutePath(filePath: string): string {
  // Remove pages/ or src/pages/ prefix and file extension
  let routePath = filePath
    .replace(/^(src\/)?pages/, '')
    .replace(/\.(ts|tsx|js|jsx)$/, '');

  // Remove /index from end if present
  routePath = routePath.replace(/\/index$/, '') || '/';

  // Ensure path starts with /
  if (!routePath.startsWith('/')) {
    routePath = '/' + routePath;
  }

  return routePath;
}

// SAFETY: method comes from HTTP_METHODS constant array, not user input
