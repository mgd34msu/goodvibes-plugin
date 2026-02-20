/**
 * Handler registry for project-engine v2.0.0.
 *
 * Maps 26 tool names to their handler functions across 8 domains.
 */

import type { ToolHandler } from '../types.js';

// Domain barrel imports
import {
  handleFindDeadCode,
  handleSafeDeleteCheck,
  handleValidateEditsPreview,
  handleDetectBreakingChanges,
  handleSemanticDiff,
  handleGetApiSurface,
} from './code-intelligence/index.js';

import {
  handleScanForSecrets,
  handleCheckPermissions,
  handleEnvAudit,
} from './security/index.js';

import {
  handleGetDatabaseSchema,
  handleQueryDatabase,
  handleGetPrismaOperations,
} from './database/index.js';

import {
  handleGetApiRoutes,
  handleGenerateOpenApi,
  handleValidateApiContract,
  handleSyncApiTypes,
} from './api/index.js';

import {
  handleAnalyzeDependencies,
  handleFindCircularDeps,
  handleUpgradePackage,
} from './deps/index.js';

import {
  handleGetTestCoverage,
  handleFindTestsForFile,
} from './test/index.js';

import {
  handleDetectMemoryLeaks,
  handleProfileFunction,
  handleLogAnalyzer,
} from './runtime/index.js';

import {
  handleScaffoldProject,
  handleAnalyzeBundle,
} from './standalone/index.js';

/**
 * Adapts a synchronous or asynchronous handler to the ToolHandler type.
 * Some handlers return ToolResponse synchronously; this wraps them uniformly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asHandler(fn: (args: any) => any): ToolHandler {
  return (args: unknown) => Promise.resolve(fn(args));
}

/**
 * Handler registry — maps tool names to handler functions.
 * 26 entries across 8 domains.
 */
const handlerRegistry = new Map<string, ToolHandler>([
  // Code Intelligence (6)
  ['project_code_dead', asHandler(handleFindDeadCode)],
  ['project_code_safe_delete', asHandler(handleSafeDeleteCheck)],
  ['project_code_preview_edits', asHandler(handleValidateEditsPreview)],
  ['project_code_breaking', asHandler(handleDetectBreakingChanges)],
  ['project_code_semantic_diff', asHandler(handleSemanticDiff)],
  ['project_code_surface', asHandler(handleGetApiSurface)],

  // Security (3)
  ['project_security_secrets', asHandler(handleScanForSecrets)],
  ['project_security_permissions', asHandler(handleCheckPermissions)],
  ['project_security_env', asHandler(handleEnvAudit)],

  // Database (3)
  ['project_db_schema', asHandler(handleGetDatabaseSchema)],
  ['project_db_query', asHandler(handleQueryDatabase)],
  ['project_db_prisma', asHandler(handleGetPrismaOperations)],

  // API (4)
  ['project_api_routes', asHandler(handleGetApiRoutes)],
  ['project_api_spec', asHandler(handleGenerateOpenApi)],
  ['project_api_validate', asHandler(handleValidateApiContract)],
  ['project_api_sync', asHandler(handleSyncApiTypes)],

  // Dependencies (3)
  ['project_deps_analyze', asHandler(handleAnalyzeDependencies)],
  ['project_deps_circular', asHandler(handleFindCircularDeps)],
  ['project_deps_upgrade', asHandler(handleUpgradePackage)],

  // Testing (2)
  ['project_test_coverage', asHandler(handleGetTestCoverage)],
  ['project_test_find', asHandler(handleFindTestsForFile)],

  // Runtime (3)
  ['project_runtime_memory', asHandler(handleDetectMemoryLeaks)],
  ['project_runtime_profile', asHandler(handleProfileFunction)],
  ['project_runtime_logs', asHandler(handleLogAnalyzer)],

  // Standalone (2)
  ['scaffold', asHandler(handleScaffoldProject)],
  ['bundle_analyze', asHandler(handleAnalyzeBundle)],
]);

/**
 * Get a handler by tool name.
 */
export function getHandler(toolName: string): ToolHandler | undefined {
  return handlerRegistry.get(toolName);
}

/**
 * Check if a tool is registered.
 */
export function hasHandler(toolName: string): boolean {
  return handlerRegistry.has(toolName);
}

/**
 * List all registered tool names.
 */
export function listHandlers(): string[] {
  return Array.from(handlerRegistry.keys());
}

export { handlerRegistry };
