/**
 * Handler registry for project-engine.
 *
 * This module exports all tool handlers for project operations including:
 * - Scaffolding (scaffold_project, list_templates)
 * - Project Info (plugin_status, project_issues, explain_codebase)
 * - Database & API (get_database_schema, get_api_routes, get_prisma_operations, query_database, generate_openapi)
 * - Dependencies (analyze_dependencies, analyze_bundle, upgrade_package)
 * - Types & Fixtures (generate_types, generate_fixture, sync_api_types)
 * - Tests (find_tests_for_file, get_test_coverage, suggest_test_cases)
 * - Git (resolve_merge_conflict, create_pull_request)
 */

import type { ToolHandler } from '../types.js';

// Import all handler modules
import { handleScaffoldProject, handleListTemplates } from './scaffolding.js';
import { handlePluginStatus } from './status.js';
import { handleProjectIssues } from './issues.js';
import { handleExplainCodebase } from './docs/index.js';
import { handleGenerateOpenApi } from './docs/index.js';
import { handleQueryDatabase } from './database/index.js';
import {
  handleGetSchema,
  handleGetDatabaseSchema,
  handleGetApiRoutes,
} from './schema/index.js';
import { handleGetPrismaOperations } from './framework/index.js';
import {
  handleAnalyzeDependencies,
  handleFindCircularDeps,
} from './deps/index.js';
import { handleAnalyzeBundle } from './build/index.js';
import { handleUpgradePackage } from './package/index.js';
import { handleGenerateTypes } from './analysis/index.js';
import { handleGenerateFixture } from './fixtures/index.js';
import { handleSyncApiTypes } from './sync/index.js';
import {
  handleFindTestsForFile,
  handleGetTestCoverage,
  handleSuggestTestCases,
} from './test/index.js';
import {
  handleCreatePullRequest,
  handleResolveMergeConflict,
} from './git/index.js';

/**
 * Handler registry - maps tool names to handler functions.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  // Scaffolding (2)
  ['scaffold_project', handleScaffoldProject],
  ['list_templates', handleListTemplates],

  // Project Info (3)
  ['plugin_status', handlePluginStatus],
  ['project_issues', handleProjectIssues],
  ['explain_codebase', handleExplainCodebase],

  // Database & API (5)
  ['get_database_schema', handleGetDatabaseSchema],
  ['get_api_routes', handleGetApiRoutes],
  ['get_prisma_operations', handleGetPrismaOperations],
  ['query_database', handleQueryDatabase],
  ['generate_openapi', handleGenerateOpenApi],

  // Schema (1) - internal tool
  ['get_schema', handleGetSchema],

  // Dependencies (3)
  ['analyze_dependencies', handleAnalyzeDependencies],
  ['find_circular_deps', handleFindCircularDeps],
  ['upgrade_package', handleUpgradePackage],

  // Build (1)
  ['analyze_bundle', handleAnalyzeBundle],

  // Types & Fixtures (3)
  ['generate_types', handleGenerateTypes],
  ['generate_fixture', handleGenerateFixture],
  ['sync_api_types', handleSyncApiTypes],

  // Tests (3)
  ['find_tests_for_file', handleFindTestsForFile],
  ['get_test_coverage', handleGetTestCoverage],
  ['suggest_test_cases', handleSuggestTestCases],

  // Git (2)
  ['create_pull_request', handleCreatePullRequest],
  ['resolve_merge_conflict', handleResolveMergeConflict],
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
