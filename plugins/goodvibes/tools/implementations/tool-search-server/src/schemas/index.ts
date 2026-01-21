/**
 * Tool schema definitions for MCP server
 *
 * Schemas are organized by domain for maintainability:
 * - discovery: search, content retrieval, recommendations
 * - context: stack detection, patterns, versions, docs, config
 * - lsp: Language Server Protocol tools
 * - frontend: React, responsive, layout, accessibility analysis
 * - validation: implementation validation, smoke tests, type checking
 * - security: secrets scanning, permissions checking
 * - error: stack parsing, type error explanation
 * - deps: dependency analysis
 * - build: bundle analysis
 * - env: environment configuration
 * - process: dev server, health monitoring, error watching
 * - runtime: browser automation, lighthouse, visual regression
 * - types: type generation, fixtures
 * - git: merge conflicts, rollback
 * - project: scaffolding, status, database, testing, analysis
 *
 * Performance features:
 * - Domain-based organization enables selective imports
 * - LazySchemaLoader provides on-demand loading for tools that need it
 * - Schemas are static and loaded once at module initialization
 */

import { CONTEXT_SCHEMAS } from './context-schemas.js';
import { LSP_SCHEMAS } from './lsp-schemas.js';
import { VALIDATION_SCHEMAS } from './validation-schemas.js';
import { SECURITY_SCHEMAS } from './security-schemas.js';
import { ERROR_SCHEMAS } from './error-schemas.js';
import { ENV_SCHEMAS } from './env-schemas.js';
import { PROCESS_SCHEMAS } from './process-schemas.js';
import { RUNTIME_SCHEMAS } from './runtime-schemas.js';
import { ANALYSIS_SCHEMAS } from './analysis-schemas.js';

// These schemas have been moved to project-engine:
// - DEPS_SCHEMAS (analyze_dependencies, find_circular_deps)
// - BUILD_SCHEMAS (analyze_bundle)
// - TYPES_SCHEMAS (generate_types, generate_fixture, sync_api_types)
// - GIT_SCHEMAS (resolve_merge_conflict)
// - PROJECT_SCHEMAS (scaffold_project, list_templates, plugin_status, project_issues, explain_codebase, get_database_schema, get_api_routes, get_prisma_operations, query_database, generate_openapi)
// - TEST_SCHEMAS (find_tests_for_file, get_test_coverage, suggest_test_cases)

// =============================================================================
// Schema Types
// =============================================================================

/**
 * Schema domain categories for lazy loading
 */
export type SchemaDomain =
  | 'context'
  | 'lsp'
  | 'validation'
  | 'security'
  | 'error'
  | 'env'
  | 'process'
  | 'runtime'
  | 'analysis';

/**
 * Tool schema interface
 */
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// =============================================================================
// Domain Mapping
// =============================================================================

/**
 * Map of domain names to their schema arrays.
 * Used for lazy loading by domain.
 */
const DOMAIN_SCHEMAS: Record<SchemaDomain, readonly ToolSchema[]> = {
  context: CONTEXT_SCHEMAS,
  lsp: LSP_SCHEMAS,
  validation: VALIDATION_SCHEMAS,
  security: SECURITY_SCHEMAS,
  error: ERROR_SCHEMAS,
  env: ENV_SCHEMAS,
  process: PROCESS_SCHEMAS,
  runtime: RUNTIME_SCHEMAS,
  analysis: ANALYSIS_SCHEMAS,
};

// =============================================================================
// Lazy Schema Loader
// =============================================================================

/**
 * Lazy loader for tool schemas by domain.
 *
 * This class provides on-demand loading of schema groups by domain,
 * which can be useful for:
 * - Tools that only need a subset of schemas
 * - Testing scenarios that need isolated schema groups
 * - Future dynamic schema registration
 *
 * Usage:
 * ```typescript
 * const loader = new LazySchemaLoader();
 *
 * // Load specific domains
 * const securitySchemas = loader.getByDomain('security');
 *
 * // Load multiple domains
 * const schemas = loader.getByDomains(['security', 'validation']);
 *
 * // Get schema for a specific tool
 * const schema = loader.getByToolName('scan_for_secrets');
 * ```
 */
export class LazySchemaLoader {
  private loadedDomains: Set<SchemaDomain> = new Set();
  private schemaMap: Map<string, ToolSchema> = new Map();

  /**
   * Get all schemas for a specific domain.
   * Schemas are cached after first access.
   */
  getByDomain(domain: SchemaDomain): readonly ToolSchema[] {
    if (!this.loadedDomains.has(domain)) {
      const schemas = DOMAIN_SCHEMAS[domain];
      for (const schema of schemas) {
        this.schemaMap.set(schema.name, schema);
      }
      this.loadedDomains.add(domain);
    }
    return DOMAIN_SCHEMAS[domain];
  }

  /**
   * Get schemas for multiple domains at once.
   */
  getByDomains(domains: SchemaDomain[]): ToolSchema[] {
    const result: ToolSchema[] = [];
    for (const domain of domains) {
      result.push(...this.getByDomain(domain));
    }
    return result;
  }

  /**
   * Get a specific schema by tool name.
   * Loads the schema lazily by checking all domains if not already cached.
   */
  getByToolName(name: string): ToolSchema | undefined {
    // Check cache first
    if (this.schemaMap.has(name)) {
      return this.schemaMap.get(name);
    }

    // Search through all domains
    for (const domain of Object.keys(DOMAIN_SCHEMAS) as SchemaDomain[]) {
      if (!this.loadedDomains.has(domain)) {
        const schemas = DOMAIN_SCHEMAS[domain];
        for (const schema of schemas) {
          this.schemaMap.set(schema.name, schema);
          if (schema.name === name) {
            this.loadedDomains.add(domain);
            return schema;
          }
        }
        this.loadedDomains.add(domain);
      }
    }

    return undefined;
  }

  /**
   * Check if a domain is already loaded.
   */
  isDomainLoaded(domain: SchemaDomain): boolean {
    return this.loadedDomains.has(domain);
  }

  /**
   * Get all loaded domains.
   */
  getLoadedDomains(): SchemaDomain[] {
    return Array.from(this.loadedDomains);
  }

  /**
   * Get all schemas (loads all domains).
   */
  getAllSchemas(): ToolSchema[] {
    const allDomains = Object.keys(DOMAIN_SCHEMAS) as SchemaDomain[];
    return this.getByDomains(allDomains);
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Combined tool schemas from all domain files.
 * This is eagerly loaded for backward compatibility with existing code.
 */
export const TOOL_SCHEMAS: readonly ToolSchema[] = [
  ...CONTEXT_SCHEMAS,
  ...LSP_SCHEMAS,
  ...VALIDATION_SCHEMAS,
  ...SECURITY_SCHEMAS,
  ...ERROR_SCHEMAS,
  ...ENV_SCHEMAS,
  ...PROCESS_SCHEMAS,
  ...RUNTIME_SCHEMAS,
  ...ANALYSIS_SCHEMAS,
];

// Re-export individual schema groups for selective imports
export {
  CONTEXT_SCHEMAS,
  LSP_SCHEMAS,
  VALIDATION_SCHEMAS,
  SECURITY_SCHEMAS,
  ERROR_SCHEMAS,
  ENV_SCHEMAS,
  PROCESS_SCHEMAS,
  RUNTIME_SCHEMAS,
  ANALYSIS_SCHEMAS,
};
