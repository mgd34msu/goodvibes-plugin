/**
 * Schema aggregator for project-engine v2.0.0.
 *
 * Combines all domain schema modules into a single export.
 * Contains 26 tool schemas across 8 domains.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { codeIntelligenceSchemas } from './code-intelligence.js';
import { securitySchemas } from './security.js';
import { databaseSchemas } from './database.js';
import { apiSchemas } from './api.js';
import { depsSchemas } from './deps.js';
import { testingSchemas } from './testing.js';
import { runtimeSchemas } from './runtime.js';
import { standaloneSchemas } from './standalone.js';

/**
 * All tool schemas provided by project-engine v2.0.0.
 * Contains 26 schemas across 8 domains:
 *   - Code Intelligence: 6 (project_code_dead, project_code_safe_delete, project_code_preview_edits,
 *                           project_code_breaking, project_code_semantic_diff, project_code_surface)
 *   - Security: 3 (project_security_secrets, project_security_permissions, project_security_env)
 *   - Database: 3 (project_db_schema, project_db_query, project_db_prisma)
 *   - API: 4 (project_api_routes, project_api_spec, project_api_validate, project_api_sync)
 *   - Dependencies: 3 (project_deps_analyze, project_deps_circular, project_deps_upgrade)
 *   - Testing: 2 (project_test_coverage, project_test_find)
 *   - Runtime: 3 (project_runtime_memory, project_runtime_profile, project_runtime_logs)
 *   - Standalone: 2 (scaffold, bundle_analyze)
 */
export const allSchemas: Tool[] = [
  ...codeIntelligenceSchemas,
  ...securitySchemas,
  ...databaseSchemas,
  ...apiSchemas,
  ...depsSchemas,
  ...testingSchemas,
  ...runtimeSchemas,
  ...standaloneSchemas,
];

export {
  codeIntelligenceSchemas,
  securitySchemas,
  databaseSchemas,
  apiSchemas,
  depsSchemas,
  testingSchemas,
  runtimeSchemas,
  standaloneSchemas,
};
