/**
 * Handler registry for analysis-engine.
 *
 * Maps tool names to their handler functions.
 * All handlers follow the pattern: (args: unknown) => Promise<CallToolResult>
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Context handlers
import { handleDetectStack, handleScanPatterns } from './context.js';
import { handleReadConfig } from './config.js';
import { handleGetConventions } from './project/conventions.js';
import { handleCheckVersions } from './npm.js';

// LSP handlers
import {
  handleFindDeadCode,
  handleGetApiSurface,
  handleSafeDeleteCheck,
  handleDetectBreakingChanges,
  handleSemanticDiff,
  handleValidateEditsPreview,
} from './lsp/index.js';

// Validation handlers
import { handleValidateImplementation, handleValidateApiContract } from './validation.js';
import { handleEnvAudit } from './env/index.js';

// Security handlers
import { handleScanForSecrets, handleCheckPermissions } from './security/index.js';

// Error handlers
import { handleParseErrorStack, handleExplainTypeError } from './errors/index.js';

// Dependency handlers
import { handleFindCircularDeps } from './deps/index.js';

/**
 * Handler function type.
 */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/**
 * Handler registry mapping tool names to handler functions.
 */
export const handlerRegistry = new Map<string, ToolHandler>([
  // Context (5 tools)
  ['detect_stack', handleDetectStack],
  ['check_versions', handleCheckVersions],
  ['scan_patterns', handleScanPatterns],
  ['read_config', handleReadConfig],
  ['get_conventions', handleGetConventions],

  // LSP / Code Intelligence (7 tools)
  ['find_dead_code', handleFindDeadCode],
  ['get_api_surface', handleGetApiSurface],
  ['safe_delete_check', handleSafeDeleteCheck],
  ['detect_breaking_changes', handleDetectBreakingChanges],
  ['semantic_diff', handleSemanticDiff],
  ['validate_edits_preview', handleValidateEditsPreview],

  // Validation & Security (9 tools)
  ['validate_implementation', handleValidateImplementation],
  ['validate_api_contract', handleValidateApiContract],
  ['env_audit', handleEnvAudit],
  ['scan_for_secrets', handleScanForSecrets],
  ['check_permissions', handleCheckPermissions],
  ['parse_error_stack', handleParseErrorStack],
  ['explain_type_error', handleExplainTypeError],

  // Dependencies (1 tool)
  ['find_circular_deps', handleFindCircularDeps],
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
