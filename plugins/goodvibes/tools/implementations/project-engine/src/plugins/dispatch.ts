/**
 * L3 Plugin Layer — Tool Dispatch Table
 *
 * Maps 26 MCP tool names to their L2 extension orchestration functions.
 * Provides argument validation helpers and a read-only dispatch table.
 *
 * Each dispatcher validates minimum required fields then casts to the
 * specific L2 argument type. The MCP schema (TOOL_SCHEMAS) is the source
 * of truth for the full argument contract.
 *
 * @module plugins/dispatch
 */

import type { McpResponse } from '../shared/types.js';

// Code Intelligence extensions
import {
  findDeadCode,
  checkSafeDelete,
  validateEditsPreview,
  detectBreakingChanges,
  semanticDiff,
  getApiSurface,
} from '../extensions/code-intel/index.js';

// API extensions
import {
  getApiRoutes,
  generateOpenApi,
  validateApiContract,
  syncApiTypes,
} from '../extensions/api/index.js';

// Security extensions
import {
  scanForSecrets,
  checkPermissions,
  auditEnvVars,
} from '../extensions/security/index.js';

// Database extensions
import {
  getDatabaseSchema,
  queryDatabase,
  getPrismaOperations,
} from '../extensions/database/index.js';

// Dependencies extensions
import {
  analyzeDependencies,
  findCircularDeps,
  analyzeUpgrade,
} from '../extensions/deps/index.js';

// Runtime extensions
import {
  detectMemoryLeaks,
  profileFunction,
  analyzeLogs,
} from '../extensions/runtime/index.js';

// Standalone extensions
import {
  analyzeBundle,
  scaffoldProject,
} from '../extensions/standalone/index.js';

// Testing extensions
import {
  getTestCoverage,
  findTestsForFile,
} from '../extensions/testing/index.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Dispatcher function signature — receives raw unknown args and returns a
 * Promise resolving to an MCP-compliant response.
 */
export type ToolDispatcher = (args: unknown) => Promise<McpResponse>;

// =============================================================================
// Argument Validation Helpers
// =============================================================================

/**
 * Assert that args is a non-null object and narrow its type.
 * Throws if args is not a plain object.
 *
 * WHY this cast exists: The MCP SDK validates incoming args against the tool's
 * inputSchema (JSON Schema) before dispatch. TypeScript cannot infer types from
 * JSON Schema at compile time, so we validate the runtime shape here and cast.
 * The double-cast pattern (as unknown as T) in each dispatcher is safe because
 * the schema contract is enforced at the MCP layer.
 *
 * @param args - The raw arguments from MCP CallTool request
 * @returns args narrowed to Record<string, unknown>
 */
function requireObject(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error(
      `Expected object arguments, got ${Array.isArray(args) ? 'array' : typeof args}`
    );
  }
  return args as Record<string, unknown>;
}

/**
 * Extract a required string field from a validated args object.
 * Throws if the field is missing or not a string.
 *
 * @param args - Validated args object
 * @param key - The required field name
 * @returns The string value of the field
 */
function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(
      `Missing or invalid required argument "${key}": expected string, got ${typeof value}`
    );
  }
  return value;
}

// =============================================================================
// Dispatch Table
// =============================================================================

/**
 * Read-only map of tool name to dispatcher function.
 * Contains 26 entries across 8 domains.
 *
 * Each dispatcher:
 * 1. Validates args is a non-null object via requireObject()
 * 2. Validates presence of schema-required fields via requireString()
 * 3. Casts to the specific L2 argument type and delegates
 */
export const DISPATCH_TABLE: ReadonlyMap<string, ToolDispatcher> = new Map<string, ToolDispatcher>([
  // Code Intelligence (6)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_code_dead', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return findDeadCode(a as unknown as Parameters<typeof findDeadCode>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_code_safe_delete', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'file');
    return checkSafeDelete(a as unknown as Parameters<typeof checkSafeDelete>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_code_preview_edits', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return validateEditsPreview(a as unknown as Parameters<typeof validateEditsPreview>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_code_breaking', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'before_ref');
    return detectBreakingChanges(a as unknown as Parameters<typeof detectBreakingChanges>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_code_semantic_diff', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'before_ref');
    return semanticDiff(a as unknown as Parameters<typeof semanticDiff>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_code_surface', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return getApiSurface(a as unknown as Parameters<typeof getApiSurface>[0]);
  }],

  // API (4)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_api_routes', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return getApiRoutes(a as unknown as Parameters<typeof getApiRoutes>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_api_spec', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return generateOpenApi(a as unknown as Parameters<typeof generateOpenApi>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_api_validate', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'spec_path');
    requireString(a, 'base_url');
    return validateApiContract(a as unknown as Parameters<typeof validateApiContract>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_api_sync', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return syncApiTypes(a as unknown as Parameters<typeof syncApiTypes>[0]);
  }],

  // Security (3)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_security_secrets', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return scanForSecrets(a as unknown as Parameters<typeof scanForSecrets>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_security_permissions', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return checkPermissions(a as unknown as Parameters<typeof checkPermissions>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_security_env', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return auditEnvVars(a as unknown as Parameters<typeof auditEnvVars>[0]);
  }],

  // Database (3)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_db_schema', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return getDatabaseSchema(a as unknown as Parameters<typeof getDatabaseSchema>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_db_query', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'query');
    return queryDatabase(a as unknown as Parameters<typeof queryDatabase>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_db_prisma', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return getPrismaOperations(a as unknown as Parameters<typeof getPrismaOperations>[0]);
  }],

  // Dependencies (3)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_deps_analyze', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return analyzeDependencies(a as unknown as Parameters<typeof analyzeDependencies>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_deps_circular', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return findCircularDeps(a as unknown as Parameters<typeof findCircularDeps>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_deps_upgrade', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'package');
    return analyzeUpgrade(a as unknown as Parameters<typeof analyzeUpgrade>[0]);
  }],

  // Runtime (3)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_runtime_memory', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'target');
    return detectMemoryLeaks(a as unknown as Parameters<typeof detectMemoryLeaks>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_runtime_profile', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'file');
    requireString(a, 'function_name');
    return profileFunction(a as unknown as Parameters<typeof profileFunction>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_runtime_logs', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'source');
    return analyzeLogs(a as unknown as Parameters<typeof analyzeLogs>[0]);
  }],

  // Standalone (2)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['bundle_analyze', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return analyzeBundle(a as unknown as Parameters<typeof analyzeBundle>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['scaffold', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'template');
    requireString(a, 'output_dir');
    return scaffoldProject(a as unknown as Parameters<typeof scaffoldProject>[0]);
  }],

  // Testing (2)
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_test_coverage', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    return getTestCoverage(a as unknown as Parameters<typeof getTestCoverage>[0]);
  }],
  // SAFETY: MCP SDK validates args against inputSchema before dispatch
  ['project_test_find', async (args): Promise<McpResponse> => {
    const a = requireObject(args);
    requireString(a, 'file');
    return findTestsForFile(a as unknown as Parameters<typeof findTestsForFile>[0]);
  }],
]);

// =============================================================================
// Dispatch Helpers
// =============================================================================

/**
 * Look up a dispatcher by tool name.
 *
 * @param name - MCP tool name
 * @returns The dispatcher function, or undefined if not found
 */
export function getDispatcher(name: string): ToolDispatcher | undefined {
  return DISPATCH_TABLE.get(name);
}

/**
 * List all registered tool names.
 *
 * @returns Array of tool names in registration order
 */
export function listTools(): string[] {
  return Array.from(DISPATCH_TABLE.keys());
}
