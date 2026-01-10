/**
 * Sync API Types Handler
 *
 * Detects type drift between backend API routes and frontend API calls.
 * Compares types defined in backend route handlers with types used in
 * frontend fetch/axios calls to identify mismatches.
 *
 * @module handlers/sync/sync-api-types
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';

import { success, error, fileExists } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';
import { handleGetApiRoutes, ApiRoute } from '../schema/api-routes.js';

/**
 * Arguments for the sync_api_types MCP tool
 */
export interface SyncApiTypesArgs {
  /** Path to backend API routes (default: auto-detect) */
  backend_path?: string;
  /** Path to frontend source (default: "src") */
  frontend_path?: string;
  /** Regex pattern to identify API call sites (default: fetch|axios|api\.) */
  api_pattern?: string;
  /** Generate fix suggestions (default: false) */
  auto_fix?: boolean;
}

/**
 * Backend route information
 */
export interface BackendRoute {
  path: string;
  file: string;
  method: string;
  request_type?: string;
  response_type?: string;
}

/**
 * Frontend API call information
 */
export interface FrontendCall {
  file: string;
  line: number;
  endpoint: string;
  method: string;
  expected_type?: string;
}

/**
 * Type drift information
 */
export interface TypeDrift {
  endpoint: string;
  backend_file: string;
  frontend_file: string;
  frontend_line: number;
  issue: 'missing_type' | 'type_mismatch' | 'endpoint_not_found';
  backend_type?: string;
  frontend_type?: string;
  diff?: string;
  suggested_fix?: string;
}

/**
 * Summary statistics
 */
export interface SyncSummary {
  total_endpoints: number;
  total_calls: number;
  in_sync: number;
  drifted: number;
  untyped: number;
}

/**
 * Result of API type sync analysis
 */
export interface SyncApiTypesResult {
  in_sync: boolean;
  backend_routes: BackendRoute[];
  frontend_calls: FrontendCall[];
  drifts: TypeDrift[];
  summary: SyncSummary;
}

/**
 * Common API paths to search for backend routes
 */
const BACKEND_PATHS = [
  'src/app/api',
  'app/api',
  'src/pages/api',
  'pages/api',
  'src/routes',
  'src/api',
  'api',
];

/**
 * Recursively find TypeScript/JavaScript files
 */
async function findFiles(
  dir: string,
  pattern: RegExp,
  exclude: RegExp = /node_modules|\.git|\.next|dist|build|coverage/
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (exclude.test(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...(await findFiles(fullPath, pattern, exclude)));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or permission denied
  }

  return files;
}

/**
 * Auto-detect backend API path
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
 * Parse backend routes and extract type information
 */
async function parseBackendRoutes(
  projectPath: string,
  backendPath: string
): Promise<BackendRoute[]> {
  const routes: BackendRoute[] = [];

  // Use existing API routes handler
  const apiRoutesResult = handleGetApiRoutes({ path: projectPath });

  if (apiRoutesResult.isError) {
    return routes;
  }

  try {
    const result = JSON.parse(apiRoutesResult.content[0].text);
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
  } catch {
    // Parse error
  }

  return routes;
}

/**
 * Extract request and response types from a route handler file
 */
async function extractTypesFromHandler(
  filePath: string,
  method: string
): Promise<{ request?: string; response?: string }> {
  const result: { request?: string; response?: string } = {};

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Create a TS source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    // Walk the AST to find handler function and its types
    const visit = (node: ts.Node): void => {
      // Look for export function GET/POST/etc.
      if (
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        node.name?.text === method
      ) {
        // Extract return type if present
        if (node.type) {
          result.response = extractTypeText(node.type, sourceFile);
        }

        // Extract request parameter type
        if (node.parameters.length > 0) {
          const firstParam = node.parameters[0];
          if (firstParam.type) {
            result.request = extractTypeText(firstParam.type, sourceFile);
          }
        }
      }

      // Look for export const GET = async (...)
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === method &&
            decl.initializer
          ) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              const fn = decl.initializer;
              if (fn.type) {
                result.response = extractTypeText(fn.type, sourceFile);
              }
              if (fn.parameters.length > 0 && fn.parameters[0].type) {
                result.request = extractTypeText(fn.parameters[0].type, sourceFile);
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Also look for Response.json<T> patterns
    const responseJsonMatch = content.match(/Response\.json<(\w+)>/);
    if (responseJsonMatch && !result.response) {
      result.response = responseJsonMatch[1];
    }

    // Look for NextResponse.json<T> patterns
    const nextResponseMatch = content.match(/NextResponse\.json<(\w+)>/);
    if (nextResponseMatch && !result.response) {
      result.response = nextResponseMatch[1];
    }

    // Look for type annotations in JSDoc
    const jsdocResponseMatch = content.match(/@returns?\s*\{([^}]+)\}/);
    if (jsdocResponseMatch && !result.response) {
      result.response = jsdocResponseMatch[1].trim();
    }
  } catch {
    // Parse error
  }

  return result;
}

/**
 * Extract type text from a TypeNode
 */
function extractTypeText(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): string {
  // Get the full text of the type from source
  const text = typeNode.getText(sourceFile);

  // Clean up Promise<...> wrapper
  const promiseMatch = text.match(/^Promise<(.+)>$/);
  if (promiseMatch) {
    return promiseMatch[1];
  }

  // Clean up Response or NextResponse wrappers
  if (text.includes('Response') || text.includes('NextResponse')) {
    // Try to extract generic parameter
    const genericMatch = text.match(/<([^>]+)>/);
    if (genericMatch) {
      return genericMatch[1];
    }
  }

  return text;
}

/**
 * Find all API calls in frontend code
 */
async function findApiCalls(
  frontendPath: string,
  pattern: RegExp
): Promise<FrontendCall[]> {
  const calls: FrontendCall[] = [];

  // Find all TS/TSX/JS/JSX files
  const files = await findFiles(
    frontendPath,
    /\.(ts|tsx|js|jsx)$/,
    /node_modules|\.git|\.next|dist|build|coverage|__tests__|\.test\.|\.spec\./
  );

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match fetch('/api/...')
        const fetchMatch = line.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (fetchMatch) {
          const endpoint = fetchMatch[1];
          if (endpoint.startsWith('/api') || endpoint.startsWith('api/')) {
            // Try to detect method from options
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

            // Try to extract expected type
            const expectedType = await extractTypeAtCall(file, i + 1, content, lines);
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

            const expectedType = await extractTypeAtCall(file, i + 1, content, lines);
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
        if (pattern.source !== 'fetch|axios|api\\.' || pattern.source.includes('api\\.')) {
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
    } catch {
      // Read error
    }
  }

  return calls;
}

/**
 * Normalize endpoint path for comparison
 */
function normalizeEndpoint(endpoint: string): string {
  // Remove leading slash if present
  let normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;

  // Remove query string
  const queryIndex = normalized.indexOf('?');
  if (queryIndex !== -1) {
    normalized = normalized.substring(0, queryIndex);
  }

  // Remove template literals ${...} and replace with [param]
  normalized = normalized.replace(/\$\{[^}]+\}/g, '[param]');

  // Normalize consecutive slashes
  normalized = normalized.replace(/\/+/g, '/');

  // Remove trailing slash
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Extract type annotation at a call site
 */
async function extractTypeAtCall(
  filePath: string,
  line: number,
  content: string,
  lines: string[]
): Promise<string | null> {
  const currentLine = lines[line - 1];

  // Look for generic type arguments: fetch<UserResponse>(...) or axios.get<User>(...)
  const genericMatch = currentLine.match(/(?:fetch|axios\.(?:get|post|put|delete|patch)|api\.(?:get|post|put|delete|patch))\s*<([^>]+)>/);
  if (genericMatch) {
    return genericMatch[1];
  }

  // Look for 'as Type' cast on the same line or next few lines
  const context = lines.slice(line - 1, Math.min(line + 3, lines.length)).join(' ');
  const asMatch = context.match(/\.json\(\)\s+as\s+(\w+)/);
  if (asMatch) {
    return asMatch[1];
  }

  // Look for variable type annotation
  // const data: UserType = await fetch(...)
  const varMatch = currentLine.match(/(?:const|let|var)\s+\w+\s*:\s*(\w+)\s*=/);
  if (varMatch) {
    return varMatch[1];
  }

  // Look for the variable declaration on previous lines
  for (let i = line - 2; i >= Math.max(0, line - 5); i--) {
    const prevLine = lines[i];
    const prevVarMatch = prevLine.match(/(?:const|let|var)\s+\w+\s*:\s*(\w+)\s*=/);
    if (prevVarMatch) {
      return prevVarMatch[1];
    }
  }

  return null;
}

/**
 * Match a frontend call to a backend route considering dynamic segments
 */
function matchEndpoint(callEndpoint: string, routePath: string): boolean {
  // Direct match
  if (callEndpoint === routePath) {
    return true;
  }

  // Convert route path pattern to regex
  // [param] -> matches any segment
  // [...slug] -> matches multiple segments
  const routePattern = routePath
    .replace(/\[\.\.\.(\w+)\]/g, '.+') // catch-all
    .replace(/\[(\w+)\]/g, '[^/]+'); // dynamic segment

  const regex = new RegExp(`^${routePattern}$`);
  return regex.test(callEndpoint);
}

/**
 * Compare types for compatibility
 */
function compareTypes(
  backendType: string | undefined,
  frontendType: string | undefined
): { matches: boolean; diff?: string } {
  if (!backendType && !frontendType) {
    return { matches: true };
  }

  if (!backendType) {
    return {
      matches: false,
      diff: `Backend has no type annotation, frontend expects: ${frontendType}`,
    };
  }

  if (!frontendType) {
    return {
      matches: false,
      diff: `Frontend has no type annotation, backend returns: ${backendType}`,
    };
  }

  // Normalize types for comparison
  const normalizedBackend = normalizeType(backendType);
  const normalizedFrontend = normalizeType(frontendType);

  if (normalizedBackend === normalizedFrontend) {
    return { matches: true };
  }

  // Check for compatible types (e.g., User vs UserResponse)
  if (
    normalizedBackend.includes(normalizedFrontend) ||
    normalizedFrontend.includes(normalizedBackend)
  ) {
    return {
      matches: false,
      diff: `Types may be compatible but differ: backend=${backendType}, frontend=${frontendType}`,
    };
  }

  return {
    matches: false,
    diff: `Type mismatch: backend=${backendType}, frontend=${frontendType}`,
  };
}

/**
 * Normalize a type name for comparison
 */
function normalizeType(typeName: string): string {
  // Remove whitespace
  let normalized = typeName.replace(/\s+/g, '');

  // Remove common wrappers
  normalized = normalized
    .replace(/^Promise<(.+)>$/, '$1')
    .replace(/^Response<(.+)>$/, '$1')
    .replace(/^NextResponse<(.+)>$/, '$1')
    .replace(/^AxiosResponse<(.+)>$/, '$1');

  return normalized.toLowerCase();
}

/**
 * Generate fix suggestion for a drift
 */
function generateFixSuggestion(
  drift: TypeDrift,
  backendRoute: BackendRoute | undefined
): string | undefined {
  if (!backendRoute) {
    return undefined;
  }

  switch (drift.issue) {
    case 'missing_type':
      if (drift.backend_type) {
        return `Add type annotation to frontend call:\n` +
          `  // Import the type from backend\n` +
          `  import type { ${drift.backend_type} } from '@/types';\n\n` +
          `  // Add generic parameter to fetch call\n` +
          `  const response = await fetch<${drift.backend_type}>('${drift.endpoint}');`;
      }
      return `Add type annotations to both backend handler and frontend call.`;

    case 'type_mismatch':
      return `Align types between backend and frontend:\n` +
        `  Backend returns: ${drift.backend_type}\n` +
        `  Frontend expects: ${drift.frontend_type}\n\n` +
        `  Consider creating a shared type definition in a common module.`;

    case 'endpoint_not_found':
      return `The endpoint '${drift.endpoint}' called in frontend doesn't match any backend route.\n` +
        `  Check for typos or missing route handler.`;

    default:
      return undefined;
  }
}

/**
 * Handles the sync_api_types MCP tool call.
 *
 * Detects type drift between backend API routes and frontend API calls.
 *
 * @param args - The sync_api_types tool arguments
 * @returns MCP tool response with drift analysis results
 */
export async function handleSyncApiTypes(
  args: SyncApiTypesArgs
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const {
    backend_path,
    frontend_path = 'src',
    api_pattern = 'fetch|axios|api\\.',
    auto_fix = false,
  } = args;

  const projectPath = PROJECT_ROOT;

  // Auto-detect or use provided backend path
  let resolvedBackendPath: string | undefined = backend_path;
  if (!resolvedBackendPath) {
    const detected = await detectBackendPath(projectPath);
    if (!detected) {
      return error(
        'Could not auto-detect backend API path. Please provide backend_path parameter. ' +
        'Searched: ' + BACKEND_PATHS.join(', ')
      );
    }
    resolvedBackendPath = detected;
  }

  // Verify backend path exists
  const fullBackendPath = path.join(projectPath, resolvedBackendPath);
  if (!(await fileExists(fullBackendPath))) {
    return error(`Backend path not found: ${fullBackendPath}`);
  }

  // Verify frontend path exists
  const fullFrontendPath = path.join(projectPath, frontend_path);
  if (!(await fileExists(fullFrontendPath))) {
    return error(`Frontend path not found: ${fullFrontendPath}`);
  }

  // Parse backend routes
  const backendRoutes = await parseBackendRoutes(projectPath, resolvedBackendPath);

  if (backendRoutes.length === 0) {
    return error(
      `No API routes found in ${resolvedBackendPath}. ` +
      'Ensure you have route handlers (route.ts for Next.js App Router, or *.ts for Express/Fastify/Hono).'
    );
  }

  // Find frontend API calls
  const pattern = new RegExp(api_pattern, 'i');
  const frontendCalls = await findApiCalls(fullFrontendPath, pattern);

  // Detect drifts
  const drifts: TypeDrift[] = [];
  let inSyncCount = 0;
  let untypedCount = 0;

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
      untypedCount++;
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
      untyped: untypedCount + drifts.filter((d) => d.issue === 'missing_type').length,
    },
  };

  return success(result);
}
