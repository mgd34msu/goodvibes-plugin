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
 * - git: PR creation, merge conflicts, rollback
 * - project: scaffolding, status, database, testing, analysis
 *
 * Performance features:
 * - Domain-based organization enables selective imports
 * - LazySchemaLoader provides on-demand loading for tools that need it
 * - Schemas are static and loaded once at module initialization
 */

import { DISCOVERY_SCHEMAS } from './discovery-schemas.js';
import { CONTEXT_SCHEMAS } from './context-schemas.js';
import { LSP_SCHEMAS } from './lsp-schemas.js';
import { FRONTEND_SCHEMAS } from './frontend-schemas.js';
import { VALIDATION_SCHEMAS } from './validation-schemas.js';
import { SECURITY_SCHEMAS } from './security-schemas.js';
import { ERROR_SCHEMAS } from './error-schemas.js';
import { DEPS_SCHEMAS } from './deps-schemas.js';
import { BUILD_SCHEMAS } from './build-schemas.js';
import { ENV_SCHEMAS } from './env-schemas.js';
import { PROCESS_SCHEMAS } from './process-schemas.js';
import { RUNTIME_SCHEMAS } from './runtime-schemas.js';
import { TYPES_SCHEMAS } from './types-schemas.js';
import { GIT_SCHEMAS } from './git-schemas.js';
import { PROJECT_SCHEMAS } from './project-schemas.js';
import { TEST_SCHEMAS } from './test-schemas.js';
import { ANALYSIS_SCHEMAS } from './analysis-schemas.js';

// =============================================================================
// Schema Types
// =============================================================================

/**
 * Schema domain categories for lazy loading
 */
export type SchemaDomain =
  | 'discovery'
  | 'context'
  | 'lsp'
  | 'frontend'
  | 'validation'
  | 'security'
  | 'error'
  | 'deps'
  | 'build'
  | 'env'
  | 'process'
  | 'runtime'
  | 'types'
  | 'git'
  | 'project'
  | 'test'
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
  discovery: DISCOVERY_SCHEMAS,
  context: CONTEXT_SCHEMAS,
  lsp: LSP_SCHEMAS,
  frontend: FRONTEND_SCHEMAS,
  validation: VALIDATION_SCHEMAS,
  security: SECURITY_SCHEMAS,
  error: ERROR_SCHEMAS,
  deps: DEPS_SCHEMAS,
  build: BUILD_SCHEMAS,
  env: ENV_SCHEMAS,
  process: PROCESS_SCHEMAS,
  runtime: RUNTIME_SCHEMAS,
  types: TYPES_SCHEMAS,
  git: GIT_SCHEMAS,
  project: PROJECT_SCHEMAS,
  test: TEST_SCHEMAS,
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
  ...DISCOVERY_SCHEMAS,
  ...CONTEXT_SCHEMAS,
  ...LSP_SCHEMAS,
  ...FRONTEND_SCHEMAS,
  ...VALIDATION_SCHEMAS,
  ...SECURITY_SCHEMAS,
  ...ERROR_SCHEMAS,
  ...DEPS_SCHEMAS,
  ...BUILD_SCHEMAS,
  ...ENV_SCHEMAS,
  ...PROCESS_SCHEMAS,
  ...RUNTIME_SCHEMAS,
  ...TYPES_SCHEMAS,
  ...GIT_SCHEMAS,
  ...PROJECT_SCHEMAS,
  ...TEST_SCHEMAS,
  ...ANALYSIS_SCHEMAS,
];

// Re-export individual schema groups for selective imports
export {
  DISCOVERY_SCHEMAS,
  CONTEXT_SCHEMAS,
  LSP_SCHEMAS,
  FRONTEND_SCHEMAS,
  VALIDATION_SCHEMAS,
  SECURITY_SCHEMAS,
  ERROR_SCHEMAS,
  DEPS_SCHEMAS,
  BUILD_SCHEMAS,
  ENV_SCHEMAS,
  PROCESS_SCHEMAS,
  RUNTIME_SCHEMAS,
  TYPES_SCHEMAS,
  GIT_SCHEMAS,
  PROJECT_SCHEMAS,
  TEST_SCHEMAS,
  ANALYSIS_SCHEMAS,
};
