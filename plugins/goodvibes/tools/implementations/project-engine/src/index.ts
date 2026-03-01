#!/usr/bin/env node
/**
 * Project Engine MCP Server v2.0.0 — Entry Point
 *
 * Consolidated project operations and code analysis server for GoodVibes.
 * Delegates to the L3 plugin layer for server instantiation and MCP wiring.
 *
 * Domains (26 tools):
 * - Code Intelligence (6): project_code_dead, project_code_safe_delete, project_code_preview_edits,
 *   project_code_breaking, project_code_semantic_diff, project_code_surface
 * - API (4): project_api_routes, project_api_spec, project_api_validate, project_api_sync
 * - Security (3): project_security_secrets, project_security_permissions, project_security_env
 * - Database (3): project_db_schema, project_db_query, project_db_prisma
 * - Dependencies (3): project_deps_analyze, project_deps_circular, project_deps_upgrade
 * - Testing (2): project_test_coverage, project_test_find
 * - Runtime (3): project_runtime_memory, project_runtime_profile, project_runtime_logs
 * - Standalone (2): scaffold, bundle_analyze
 */

import { bootstrap } from './plugins/server.js';
export { bootstrap };

bootstrap().catch(console.error);
