/**
 * syncApiTypes extension for the api domain.
 *
 * Detects type drift between backend API routes and frontend API calls.
 * Compares types defined in backend route handlers with types used in
 * frontend fetch/axios calls to identify mismatches.
 *
 * @module extensions/api/sync
 */

import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/response.js';
import { fileExists } from '../../shared/utils.js';
import { logWarn } from '../../shared/logger.js';

import type {
  SyncApiTypesArgs,
  BackendRoute,
  FrontendCall,
  TypeDrift,
  SyncApiTypesResult,
  ApiRoute,
  Framework,
} from '../../core/api/types.js';
import { BACKEND_PATHS } from '../../core/api/constants.js';
import { detectFramework } from '../../core/api/detection.js';
import { matchEndpoint, normalizeEndpoint, generateFixSuggestion } from '../../core/api/matching.js';
import { compareTypes, extractTypesFromHandler } from '../../core/api/type-extraction.js';
import { getApiRoutes } from './routes.js';

/**
 * Auto-detect backend API path by checking known convention directories.
 *
 * @param projectPath - Absolute path to the project root
 * @returns The first found backend API path relative to project root, or null
 */
async function detectBackendPath(projectPath: string): Promise<string | null> {
  for (const apiPath of BACKEND_PATHS) {
    const fullPath = path.join(projectPath, apiPath);
    if (await fileExists(fullPath)) {
      return apiPath;
    }
  }
  return null;
}

/**
 * Parse backend routes and extract type information from handler files.
 *
 * @param projectPath - Absolute path to the project root
 * @param backendPath - Relative path to the backend API directory
 * @returns Array of backend routes with optional type information
 */
async function parseBackendRoutes(
  projectPath: string,
  backendPath: string,
  framework?: 'nextjs' | 'express' | 'fastify' | 'hono' | 'auto'
): Promise<BackendRoute[]> {
  const routes: BackendRoute[] = [];

  // Use the routes extension to discover API routes, passing framework if specified
  const apiRoutesResponse = getApiRoutes({ path: projectPath, framework: framework || 'auto' });

  if (apiRoutesResponse.isError) {
    return routes;
  }

  try {
    const result = JSON.parse(apiRoutesResponse.content[0].text) as { routes?: ApiRoute[] };
    const apiRoutes: ApiRoute[] = result.routes || [];

    for (const route of apiRoutes) {
      const routeInfo: BackendRoute = {
        path: route.path,
        file: route.handler_file,
        method: route.method,
      };

      // Try to extract types from the handler file
      const handlerPath = path.join(projectPath, route.handler_file);
      if (await fileExists(handlerPath)) {
        const types = await extractTypesFromHandler(handlerPath, route.method);
        routeInfo.request_type = types.request;
        routeInfo.response_type = types.response;
      }

      routes.push(routeInfo);
    }
  } catch (err) {
    logWarn('[parseBackendRoutes] Failed to parse API routes response', err);
  }

  return routes;
}

/**
 * Recursively find TypeScript/JavaScript source files in a directory.
 *
 * @param dir - Directory to search
 * @param pattern - Pattern to match file names
 * @param exclude - Pattern to exclude paths
 * @returns Array of absolute file paths
 */
async function findApiFiles(
  dir: string,
  pattern: RegExp,
  exclude: RegExp = /node_modules|\.git|\.next|dist|build|coverage/
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (exclude.test(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...(await findApiFiles(fullPath, pattern, exclude)));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    logWarn('[findApiFiles] Directory not accessible', err);
  }

  return files;
}

/**
 * Extract the expected type annotation at a frontend API call site.
 *
 * Looks for generic type arguments, `as Type` casts, and variable type annotations
 * near the call site.
 *
 * @param lines - All lines of the source file
 * @param lineIndex - 0-based line index of the call
 * @returns Detected type string, or null if not found
 */
function extractTypeAtCall(lines: string[], lineIndex: number): string | null {
  const currentLine = lines[lineIndex];

  // Look for generic type arguments: fetch<UserResponse>(...) or axios.get<User>(...)
  const genericMatch = currentLine.match(
    /(?:fetch|axios\.(?:get|post|put|delete|patch)|api\.(?:get|post|put|delete|patch))\s*<([^>]+)>/
  );
  if (genericMatch) {
    return genericMatch[1];
  }

  // Look for 'as Type' cast on the same line or next few lines
  const context = lines.slice(lineIndex, Math.min(lineIndex + 4, lines.length)).join(' ');
  const asMatch = context.match(/\.json\(\)\s+as\s+(\w+)/);
  if (asMatch) {
    return asMatch[1];
  }

  // Look for variable type annotation
  const varMatch = currentLine.match(/(?:const|let|var)\s+\w+\s*:\s*(\w+)\s*=/);
  if (varMatch) {
    return varMatch[1];
  }

  // Look for the variable declaration on previous lines
  for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 5); i--) {
    const prevLine = lines[i];
    const prevVarMatch = prevLine.match(/(?:const|let|var)\s+\w+\s*:\s*(\w+)\s*=/);
    if (prevVarMatch) {
      return prevVarMatch[1];
    }
  }

  return null;
}

/**
 * Find all API calls in frontend source files.
 *
 * Scans for fetch(), axios.method(), and api.method() call patterns targeting
 * paths starting with '/api' or 'api/'.
 *
 * @param frontendPath - Absolute path to frontend source directory
 * @param pattern - Regex to identify API call patterns
 * @returns Array of discovered frontend API calls
 */
async function findApiCalls(
  frontendPath: string,
  pattern: RegExp
): Promise<FrontendCall[]> {
  const calls: FrontendCall[] = [];

  // Find all TS/TSX/JS/JSX files
  const files = await findApiFiles(
    frontendPath,
    /\.(ts|tsx|js|jsx)$/,
    /node_modules|\.git|\.next|dist|build|coverage|__tests__|\.test\.|\.spec\./
  );

  for (const file of files) {
    try {
      const content = await fsPromises.readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match fetch('/api/...')
        const fetchMatch = line.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (fetchMatch) {
          const endpoint = fetchMatch[1];
          if (endpoint.startsWith('/api') || endpoint.startsWith('api/')) {
            let method = 'GET';
            const methodMatch = line.match(/method\s*:\s*['"`](\w+)['"`]/i) ||
              lines.slice(i, Math.min(i + 5, lines.length)).join('').match(/method\s*:\s*['"`](\w+)['"`]/i);
            if (methodMatch) {
              method = methodMatch[1].toUpperCase();
            }

            const call: FrontendCall = {
              file: path.relative(PROJECT_ROOT, file),
              line: i + 1,
              endpoint: normalizeEndpoint(endpoint),
              method,
            };

            const expectedType = extractTypeAtCall(lines, i);
            if (expectedType) {
              call.expected_type = expectedType;
            }

            calls.push(call);
          }
        }

        // Match axios.get/post/etc('/api/...')
        const axiosMatch = line.match(/axios\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i);
        if (axiosMatch) {
          const method = axiosMatch[1].toUpperCase();
          const endpoint = axiosMatch[2];
          if (endpoint.startsWith('/api') || endpoint.startsWith('api/')) {
            const call: FrontendCall = {
              file: path.relative(PROJECT_ROOT, file),
              line: i + 1,
              endpoint: normalizeEndpoint(endpoint),
              method,
            };

            const expectedType = extractTypeAtCall(lines, i);
            if (expectedType) {
              call.expected_type = expectedType;
            }

            calls.push(call);
          }
        }

        // Match axios('/api/...') with config
        const axiosConfigMatch = line.match(/axios\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (axiosConfigMatch && !axiosMatch) {
          const endpoint = axiosConfigMatch[1];
          if (endpoint.startsWith('/api') || endpoint.startsWith('api/')) {
            let method = 'GET';
            const methodMatch = line.match(/method\s*:\s*['"`](\w+)['"`]/i) ||
              lines.slice(i, Math.min(i + 5, lines.length)).join('').match(/method\s*:\s*['"`](\w+)['"`]/i);
            if (methodMatch) {
              method = methodMatch[1].toUpperCase();
            }

            calls.push({
              file: path.relative(PROJECT_ROOT, file),
              line: i + 1,
              endpoint: normalizeEndpoint(endpoint),
              method,
            });
          }
        }

        // Match api.get/post/etc (custom api client)
        if (pattern.source.includes('api\\.') || pattern.test(line)) {
          const apiClientMatch = line.match(/api\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i);
          if (apiClientMatch) {
            const method = apiClientMatch[1].toUpperCase();
            const endpoint = apiClientMatch[2];
            calls.push({
              file: path.relative(PROJECT_ROOT, file),
              line: i + 1,
              endpoint: normalizeEndpoint(endpoint),
              method,
            });
          }
        }
      }
    } catch (err) {
      logWarn('[findApiCalls] Failed to read file', err);
    }
  }

  return calls;
}

/**
 * Detects type drift between backend API routes and frontend API calls.
 *
 * Scans backend routes for type annotations and frontend code for API call sites,
 * then compares them to identify mismatches, missing types, and unmatched endpoints.
 *
 * @param args - Tool arguments specifying backend/frontend paths and options
 * @returns MCP tool response with drift analysis results
 *
 * @example
 * ```typescript
 * const result = await syncApiTypes({ auto_fix: true });
 * // Returns drift analysis with optional fix suggestions
 * ```
 */
export async function syncApiTypes(
  args: SyncApiTypesArgs
): Promise<McpResponse> {
  const {
    backend_path,
    frontend_path = 'src',
    api_pattern = 'fetch|axios|api\\.',
    auto_fix = false,
    framework: frameworkArg = 'auto',
  } = args;

  const projectPath = PROJECT_ROOT;

  // Resolve the effective framework — needed to decide path detection strategy
  const effectiveFramework: Framework | null =
    frameworkArg === 'auto' ? detectFramework(projectPath) : (frameworkArg as Framework);

  // Next.js uses file-system conventions (route.ts files in known dirs),
  // so directory-based path detection is required. Express/Fastify/Hono use
  // router patterns that may live anywhere in the project, so we fall back
  // to the project root rather than requiring a specific directory match.
  const isNextJs = effectiveFramework === 'nextjs';

  // Auto-detect or use provided backend path
  let resolvedBackendPath: string | undefined = backend_path;
  if (!resolvedBackendPath) {
    const detected = await detectBackendPath(projectPath);
    if (!detected) {
      if (isNextJs) {
        // Next.js routes must be in a known directory — hard failure
        return fail(
          'Could not auto-detect backend API path. Please provide backend_path parameter. ' +
          'Searched: ' + BACKEND_PATHS.join(', ')
        );
      }
      // For Express/Fastify/Hono, routes are not directory-based.
      // Use project root so the router parser can scan all source files.
      resolvedBackendPath = '.';
    } else {
      resolvedBackendPath = detected;
    }
  }

  // Verify backend path exists
  const fullBackendPath = path.join(projectPath, resolvedBackendPath);
  if (!(await fileExists(fullBackendPath))) {
    return fail(`Backend path not found: ${fullBackendPath}`);
  }

  // Verify frontend path exists
  const fullFrontendPath = path.join(projectPath, frontend_path);
  if (!(await fileExists(fullFrontendPath))) {
    return fail(`Frontend path not found: ${fullFrontendPath}`);
  }

  // Parse backend routes, forwarding the resolved framework
  const backendRoutes = await parseBackendRoutes(projectPath, resolvedBackendPath, frameworkArg);

  if (backendRoutes.length === 0) {
    const frameworkHint = effectiveFramework
      ? `Detected framework: ${effectiveFramework}. `
      : '';
    return fail(
      `No API routes found in ${resolvedBackendPath}. ` +
      frameworkHint +
      'Ensure you have route handlers (route.ts for Next.js App Router, or ' +
      'router.get/post/put/delete patterns for Express/Fastify/Hono). ' +
      'You can also specify the framework explicitly with the framework parameter.'
    );
  }

  // Find frontend API calls
  const pattern = new RegExp(api_pattern, 'i');
  const frontendCalls = await findApiCalls(fullFrontendPath, pattern);

  // Detect drifts
  const drifts: TypeDrift[] = [];
  let inSyncCount = 0;

  for (const call of frontendCalls) {
    // Find matching backend route
    const matchingRoute = backendRoutes.find(
      (route) =>
        matchEndpoint(call.endpoint, route.path) && route.method === call.method
    );

    if (!matchingRoute) {
      // Endpoint not found in backend
      const drift: TypeDrift = {
        endpoint: call.endpoint,
        backend_file: 'N/A',
        frontend_file: call.file,
        frontend_line: call.line,
        issue: 'endpoint_not_found',
      };

      if (auto_fix) {
        drift.suggested_fix = generateFixSuggestion(drift, undefined);
      }

      drifts.push(drift);
      continue;
    }

    // Both untyped
    if (!matchingRoute.response_type && !call.expected_type) {
      const drift: TypeDrift = {
        endpoint: call.endpoint,
        backend_file: matchingRoute.file,
        frontend_file: call.file,
        frontend_line: call.line,
        issue: 'missing_type',
        diff: 'Both backend and frontend lack type annotations',
      };

      if (auto_fix) {
        drift.suggested_fix = generateFixSuggestion(drift, matchingRoute);
      }

      drifts.push(drift);
      continue;
    }

    // One side missing type
    if (!matchingRoute.response_type || !call.expected_type) {
      const drift: TypeDrift = {
        endpoint: call.endpoint,
        backend_file: matchingRoute.file,
        frontend_file: call.file,
        frontend_line: call.line,
        issue: 'missing_type',
        backend_type: matchingRoute.response_type,
        frontend_type: call.expected_type,
        diff: !matchingRoute.response_type
          ? `Backend missing type annotation, frontend expects: ${call.expected_type}`
          : `Frontend missing type annotation, backend returns: ${matchingRoute.response_type}`,
      };

      if (auto_fix) {
        drift.suggested_fix = generateFixSuggestion(drift, matchingRoute);
      }

      drifts.push(drift);
      continue;
    }

    // Compare types
    const comparison = compareTypes(matchingRoute.response_type, call.expected_type);

    if (comparison.matches) {
      inSyncCount++;
    } else {
      const drift: TypeDrift = {
        endpoint: call.endpoint,
        backend_file: matchingRoute.file,
        frontend_file: call.file,
        frontend_line: call.line,
        issue: 'type_mismatch',
        backend_type: matchingRoute.response_type,
        frontend_type: call.expected_type,
        diff: comparison.diff,
      };

      if (auto_fix) {
        drift.suggested_fix = generateFixSuggestion(drift, matchingRoute);
      }

      drifts.push(drift);
    }
  }

  const result: SyncApiTypesResult = {
    in_sync: drifts.length === 0,
    backend_routes: backendRoutes,
    frontend_calls: frontendCalls,
    drifts,
    summary: {
      total_endpoints: backendRoutes.length,
      total_calls: frontendCalls.length,
      in_sync: inSyncCount,
      drifted: drifts.filter((d) => d.issue === 'type_mismatch').length,
      untyped: drifts.filter((d) => d.issue === 'missing_type').length,
    },
  };

  return ok(result);
}
