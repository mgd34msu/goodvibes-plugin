/**
 * API Routes Parser
 *
 * Extracts API routes from web frameworks:
 * - Next.js (App Router & Pages Router)
 * - Express
 * - Fastify
 * - Hono
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';

/** Arguments for get_api_routes tool */
export interface GetApiRoutesArgs {
  path?: string;
  framework?: 'nextjs' | 'express' | 'fastify' | 'hono' | 'auto';
}

/** Single route definition */
export interface ApiRoute {
  method: string;
  path: string;
  handler_file: string;
  handler_line: number;
  middleware?: string[];
}

/** Result of API route scanning */
export interface ApiRoutesResult {
  framework: string;
  routes: ApiRoute[];
  count: number;
}

type Framework = 'nextjs' | 'express' | 'fastify' | 'hono';

/**
 * Handle get_api_routes tool call
 */
export function handleGetApiRoutes(args: GetApiRoutesArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const framework = args.framework || 'auto';

  let detectedFramework: Framework | null = null;
  let routes: ApiRoute[] = [];

  if (framework === 'auto') {
    detectedFramework = detectFramework(projectPath);
    if (!detectedFramework) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Could not auto-detect framework. Please specify framework parameter.',
            hint: 'Supported frameworks: nextjs, express, fastify, hono',
          }, null, 2),
        }],
        isError: true,
      };
    }
  } else {
    detectedFramework = framework as Framework;
  }

  switch (detectedFramework) {
    case 'nextjs':
      routes = parseNextJsRoutes(projectPath);
      break;
    case 'express':
      routes = parseExpressRoutes(projectPath);
      break;
    case 'fastify':
      routes = parseFastifyRoutes(projectPath);
      break;
    case 'hono':
      routes = parseHonoRoutes(projectPath);
      break;
  }

  const result: ApiRoutesResult = {
    framework: detectedFramework,
    routes,
    count: routes.length,
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}

/**
 * Detect framework from package.json and project structure
 */
function detectFramework(projectPath: string): Framework | null {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for Next.js first (most common)
    if (allDeps['next']) {
      return 'nextjs';
    }

    // Check for Hono
    if (allDeps['hono']) {
      return 'hono';
    }

    // Check for Fastify
    if (allDeps['fastify']) {
      return 'fastify';
    }

    // Check for Express
    if (allDeps['express']) {
      return 'express';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse Next.js routes (App Router and Pages Router)
 */
function parseNextJsRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];

  // App Router: app/api/**/route.ts
  const appApiDir = path.join(projectPath, 'app', 'api');
  if (fs.existsSync(appApiDir)) {
    routes.push(...parseNextJsAppRouter(appApiDir, projectPath));
  }

  // Also check src/app/api for projects with src directory
  const srcAppApiDir = path.join(projectPath, 'src', 'app', 'api');
  if (fs.existsSync(srcAppApiDir)) {
    routes.push(...parseNextJsAppRouter(srcAppApiDir, projectPath));
  }

  // Pages Router: pages/api/**/*.ts
  const pagesApiDir = path.join(projectPath, 'pages', 'api');
  if (fs.existsSync(pagesApiDir)) {
    routes.push(...parseNextJsPagesRouter(pagesApiDir, projectPath));
  }

  // Also check src/pages/api
  const srcPagesApiDir = path.join(projectPath, 'src', 'pages', 'api');
  if (fs.existsSync(srcPagesApiDir)) {
    routes.push(...parseNextJsPagesRouter(srcPagesApiDir, projectPath));
  }

  return routes;
}

/**
 * Parse Next.js App Router routes
 */
function parseNextJsAppRouter(apiDir: string, projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const routeFiles = findFiles(apiDir, /route\.(ts|tsx|js|jsx)$/);

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
 * Parse Next.js Pages Router routes
 */
function parseNextJsPagesRouter(apiDir: string, projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const apiFiles = findFiles(apiDir, /\.(ts|tsx|js|jsx)$/, /route\.(ts|tsx|js|jsx)$/);

  for (const apiFile of apiFiles) {
    const content = fs.readFileSync(apiFile, 'utf-8');
    const relativePath = path.relative(projectPath, apiFile).replace(/\\/g, '/');

    // Extract route path from file location
    // e.g., pages/api/users/[id].ts -> /api/users/[id]
    const routePath = extractNextJsPagesRoutePath(relativePath);

    // Pages Router uses default export handler
    // Check for method-specific handling inside the handler
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
 * Detect which HTTP methods are handled in a Pages Router handler
 */
function detectPagesRouterMethods(content: string): string[] {
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
 * Extract route path from Next.js App Router file path
 */
function extractNextJsRoutePath(filePath: string): string {
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
 * Extract route path from Next.js Pages Router file path
 */
function extractNextJsPagesRoutePath(filePath: string): string {
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

/**
 * Parse Express routes
 */
function parseExpressRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const srcDir = path.join(projectPath, 'src');
  const searchDirs = fs.existsSync(srcDir) ? [srcDir] : [projectPath];

  for (const dir of searchDirs) {
    const tsFiles = findFiles(dir, /\.(ts|js)$/, /node_modules|\.d\.ts$/);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');

      routes.push(...parseExpressFileRoutes(content, relativePath));
    }
  }

  return routes;
}

/**
 * Parse Express routes from a single file
 */
function parseExpressFileRoutes(content: string, filePath: string): ApiRoute[] {
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
 * Extract middleware from Express route definition
 */
function extractExpressMiddleware(content: string, startIndex: number): string[] {
  const middleware: string[] = [];

  // Find the full route definition (up to the closing parenthesis of the handler)
  const routeStart = content.indexOf('(', startIndex);
  if (routeStart === -1) return middleware;

  // Get text from route path to end of line (simple heuristic)
  const lineEnd = content.indexOf('\n', routeStart);
  const routeLine = content.substring(routeStart, lineEnd > -1 ? lineEnd : undefined);

  // Look for middleware function names between path and handler
  // Pattern: , middlewareName, or , [middleware1, middleware2]
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

/**
 * Parse Fastify routes
 */
function parseFastifyRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const srcDir = path.join(projectPath, 'src');
  const searchDirs = fs.existsSync(srcDir) ? [srcDir] : [projectPath];

  for (const dir of searchDirs) {
    const tsFiles = findFiles(dir, /\.(ts|js)$/, /node_modules|\.d\.ts$/);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');

      routes.push(...parseFastifyFileRoutes(content, relativePath));
    }
  }

  return routes;
}

/**
 * Parse Fastify routes from a single file
 */
function parseFastifyFileRoutes(content: string, filePath: string): ApiRoute[] {
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
  const routePattern = /(?:fastify|server|app)\.route\s*\(\s*\{[^}]*method\s*:\s*['"](\w+)['"][^}]*url\s*:\s*['"]([^'"]+)['"]|url\s*:\s*['"]([^'"]+)['"][^}]*method\s*:\s*['"](\w+)['"]/g;

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

/**
 * Parse Hono routes
 */
function parseHonoRoutes(projectPath: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const srcDir = path.join(projectPath, 'src');
  const searchDirs = fs.existsSync(srcDir) ? [srcDir] : [projectPath];

  for (const dir of searchDirs) {
    const tsFiles = findFiles(dir, /\.(ts|js)$/, /node_modules|\.d\.ts$/);

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(projectPath, file).replace(/\\/g, '/');

      routes.push(...parseHonoFileRoutes(content, relativePath));
    }
  }

  return routes;
}

/**
 * Parse Hono routes from a single file
 */
function parseHonoFileRoutes(content: string, filePath: string): ApiRoute[] {
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
  const onPattern = /(?:app|api|route|router|hono)\.on\s*\(\s*['"](\w+)['"],\s*['"]([^'"]+)['"]/g;

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

/**
 * Recursively find files matching a pattern
 */
function findFiles(dir: string, includePattern: RegExp, excludePattern?: RegExp): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip excluded paths
    if (excludePattern && excludePattern.test(fullPath)) {
      continue;
    }

    // Skip common non-source directories
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'build', '.turbo'].includes(entry.name)) {
        continue;
      }
      files.push(...findFiles(fullPath, includePattern, excludePattern));
    } else if (entry.isFile() && includePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Get line number from character index
 */
function getLineNumber(content: string, index: number): number {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}
