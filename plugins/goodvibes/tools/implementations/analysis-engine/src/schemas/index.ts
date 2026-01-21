/**
 * Tool schema definitions for analysis-engine MCP server
 *
 * Provides code analysis and intelligence tools:
 * - context: Stack detection, patterns, versions, config
 * - lsp: Dead code, API surface, breaking changes
 * - validation: Implementation validation, edit preview, API contract, env audit
 * - security: Secrets scanning, permissions checking
 * - error: Stack parsing, type error explanation
 * - deps: Circular dependency detection
 * - analysis: Technical debt identification
 */

import { CONTEXT_SCHEMAS } from './context-schemas.js';
import { LSP_SCHEMAS } from './lsp-schemas.js';
import { VALIDATION_SCHEMAS } from './validation-schemas.js';
import { SECURITY_SCHEMAS } from './security-schemas.js';
import { ERROR_SCHEMAS } from './error-schemas.js';
import { DEPS_SCHEMAS } from './deps-schemas.js';
// TODO: Re-enable when test/coverage and issues modules are migrated
// import { ANALYSIS_SCHEMAS } from './analysis-schemas.js';

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

/**
 * Combined tool schemas from all domain files.
 */
export const ALL_SCHEMAS: readonly ToolSchema[] = [
  ...CONTEXT_SCHEMAS,
  ...LSP_SCHEMAS,
  ...VALIDATION_SCHEMAS,
  ...SECURITY_SCHEMAS,
  ...ERROR_SCHEMAS,
  ...DEPS_SCHEMAS,
  // TODO: Re-enable when test/coverage and issues modules are migrated
  // ...ANALYSIS_SCHEMAS,
];

// Re-export individual schema groups for selective imports
export {
  CONTEXT_SCHEMAS,
  LSP_SCHEMAS,
  VALIDATION_SCHEMAS,
  SECURITY_SCHEMAS,
  ERROR_SCHEMAS,
  DEPS_SCHEMAS,
  // ANALYSIS_SCHEMAS, // TODO: Re-enable when modules are migrated
};
