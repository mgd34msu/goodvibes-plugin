/**
 * Tool Handler Registry
 *
 * This module provides a centralized registry mapping tool names to their handler functions.
 * Handlers are organized by category for maintainability and use a declarative registration pattern.
 *
 * @example
 * // In the server's CallToolRequest handler:
 * const handler = TOOL_HANDLERS[toolName];
 * if (handler) {
 *   return await handler(context, args);
 * }
 */

import type { ToolHandlerRegistry, HandlerContext, ToolHandlerResponse } from "./types.js";

// Import all handlers from their respective modules
// NOTE: The following handlers have been moved to project-engine:
// - handlePluginStatus, handleProjectIssues (project info)
// - handleScaffoldProject, handleListTemplates (scaffolding)
// - handleGenerateOpenApi, handleExplainCodebase (docs)
// - handleGetDatabaseSchema, handleGetApiRoutes (schema/api)

import { handleDetectStack, handleScanPatterns } from "./context.js";
import { handleCheckVersions } from "./npm.js";
import { handleFetchDocs } from "./docs.js";
import { handleGetSchema } from "./schema.js";
import { handleReadConfig } from "./config.js";
import { handleValidateImplementation, handleCheckTypes } from "./validation.js";
import { handleRunSmokeTest } from "./smoke-test.js";
import {
  handleFindDeadCode,
  handleGetApiSurface,
  handleDetectBreakingChanges,
  handleSemanticDiff,
  handleSafeDeleteCheck,
  handleValidateEditsPreview,
  handleValidateEditsPreview,
} from "./lsp/index.js";
// NOTE: Moved to project-engine:
// - handleAnalyzeDependencies, handleFindCircularDeps (deps)
// - handleFindTestsForFile, handleGetTestCoverage, handleSuggestTestCases (test)
// - handleGetPrismaOperations (framework)
// - handleAnalyzeBundle (build)

import { handleParseErrorStack, handleExplainTypeError } from "./errors/index.js";
import { handleScanForSecrets, handleCheckPermissions } from "./security/index.js";
import { handleGetConventions } from "./project/index.js";
import {
  handleStartDevServer,
  handleWatchForErrors,
  handleHealthMonitor,
} from "./process/index.js";
import {
  handleBrowserAutomation,
  handleVerifyRuntimeBehavior,
  handleLighthouseAudit,
  handleVisualRegression,
} from "./runtime/index.js";
// NOTE: Moved to project-engine:
// - handleResolveMergeConflict (edit/git)
// - handleGenerateTypes (analysis)
// - handleQueryDatabase (database)
// - handleUpgradePackage (package)
// - handleSyncApiTypes (sync)
// - handleGenerateFixture (fixtures)
// - handleCreatePullRequest (git)

import {
  handleRetryWithLearning,
  handleAtomicMultiEdit,
  handleAutoRollback,
  handleValidateApiContract,
} from "./edit/index.js";
import {
  handleProfileFunction,
  handleLogAnalyzer,
  handleIdentifyTechDebt,
  handleDetectMemoryLeaks,
} from "./analysis/index.js";
import { handleValidateEnvComplete } from "./env/index.js";
import {
  handleBatchRead,
  handleSmartGlob,
  handleGrepWithContent,
} from "./batch/index.js";

// =============================================================================
// ARGUMENT TYPES - Imported directly from source modules to avoid circular deps
// =============================================================================

// Core types from main types module
import type {
  DetectStackArgs,
  ScanPatternsArgs,
} from "../types.js";

// Handler-specific arg types - imported directly from source modules
// Type imports for remaining handlers
import type { CheckVersionsArgs } from "./npm.js";
import type { FetchDocsArgs } from "./docs.js";
import type { GetSchemaArgs } from "./schema.js";
import type { ReadConfigArgs } from "./config.js";
import type { ValidateImplementationArgs, CheckTypesArgs } from "./validation.js";
import type { RunSmokeTestArgs } from "./smoke-test.js";

// LSP arg types - imported from lsp/index.js which re-exports from individual modules
import type {
  FindReferencesArgs,
  GoToDefinitionArgs,
  GetImplementationsArgs,
  RenameSymbolArgs,
  GetCodeActionsArgs,
  ApplyCodeActionArgs,
  GetCallHierarchyArgs,
  GetTypeHierarchyArgs,
  GetSymbolInfoArgs,
  GetSignatureHelpArgs,
  GetDocumentSymbolsArgs,
  GetDiagnosticsArgs,
  FindDeadCodeArgs,
  GetApiSurfaceArgs,
  DetectBreakingChangesArgs,
  SemanticDiffArgs,
  WorkspaceSymbolsArgs,
  SafeDeleteCheckArgs,
  GetInlayHintsArgs,
  ValidateEditsPreviewArgs,
} from "./lsp/index.js";

// Error handling arg types
import type { ParseErrorStackArgs, ExplainTypeErrorArgs } from "./errors/index.js";

// Security arg types
import type { ScanForSecretsArgs, CheckPermissionsArgs } from "./security/index.js";

// Project arg types
import type { GetEnvConfigArgs, GetConventionsArgs } from "./project/index.js";

// Process arg types
import type { StartDevServerArgs, WatchForErrorsArgs, HealthMonitorArgs } from "./process/index.js";

// Runtime arg types
import type {
  BrowserAutomationArgs,
  VerifyRuntimeBehaviorArgs,
  LighthouseAuditArgs,
  VisualRegressionArgs,
} from "./runtime/index.js";

// Edit tool arg types
import type {
  RetryWithLearningArgs,
  AtomicMultiEditArgs,
  AutoRollbackArgs,
  ValidateApiContractArgs,
} from "./edit/index.js";

// Analysis arg types
import type {
  ProfileFunctionArgs,
  LogAnalyzerArgs,
  IdentifyTechDebtArgs,
  DetectMemoryLeaksArgs,
} from "./analysis/index.js";

// Environment arg types
import type { ValidateEnvCompleteArgs } from "./env/index.js";

// Batch tool arg types
import type {
  BatchReadArgs,
  SmartGlobArgs,
  GrepWithContentArgs,
} from "./batch/index.js";

/**
 * Helper to create a context-independent handler.
 * Wraps handlers that don't need the context object.
 */
function noContext<TArgs>(
  handler: (args: TArgs) => ToolHandlerResponse | Promise<ToolHandlerResponse>,
): (ctx: HandlerContext, args: unknown) => ToolHandlerResponse | Promise<ToolHandlerResponse> {
  return (_ctx, args) => handler(args as TArgs);
}

// =============================================================================
// CONTEXT HANDLERS
// Stack detection, pattern scanning, and version checking
// =============================================================================
const contextHandlers: ToolHandlerRegistry = {
  detect_stack: noContext(handleDetectStack),
  check_versions: noContext(handleCheckVersions),
  scan_patterns: noContext(handleScanPatterns),
};

// =============================================================================
// DOCS HANDLERS
// Documentation fetching (moved: generate_openapi, explain_codebase → project-engine)
// =============================================================================
const docsHandlers: ToolHandlerRegistry = {
  fetch_docs: noContext(handleFetchDocs),
};

// =============================================================================
// SCHEMA HANDLERS
// Schema parsing (moved: get_database_schema, get_api_routes → project-engine)
// =============================================================================
const schemaHandlers: ToolHandlerRegistry = {
  get_schema: noContext(handleGetSchema),
  read_config: noContext(handleReadConfig),
};

// =============================================================================
// VALIDATION HANDLERS
// Code validation, type checking, smoke testing
// =============================================================================
const validationHandlers: ToolHandlerRegistry = {
  validate_implementation: noContext(handleValidateImplementation),
  run_smoke_test: noContext(handleRunSmokeTest),
  check_types: noContext(handleCheckTypes),
};

// =============================================================================
// SCAFFOLDING HANDLERS (moved to project-engine)
// =============================================================================
// const scaffoldingHandlers: ToolHandlerRegistry = {};

// =============================================================================
// STATUS HANDLERS (moved to project-engine)
// =============================================================================
// const statusHandlers: ToolHandlerRegistry = {};

// =============================================================================
// LSP HANDLERS
// Language Server Protocol based tools for code intelligence
// =============================================================================
const lspHandlers: ToolHandlerRegistry = {
  // Note: Most LSP handlers are not yet implemented - only these 6 exist:
  find_dead_code: noContext(handleFindDeadCode),
  get_api_surface: noContext(handleGetApiSurface),
  detect_breaking_changes: noContext(handleDetectBreakingChanges),
  semantic_diff: noContext(handleSemanticDiff),
  safe_delete_check: noContext(handleSafeDeleteCheck),
  validate_edits_preview: noContext(handleValidateEditsPreview),
};

// =============================================================================
// DEPENDENCY HANDLERS (moved to project-engine)
// =============================================================================
// const depsHandlers: ToolHandlerRegistry = {};

// =============================================================================
// ERROR HANDLERS
// Error stack parsing and type error explanation
// =============================================================================
const errorHandlers: ToolHandlerRegistry = {
  parse_error_stack: noContext(handleParseErrorStack),
  explain_type_error: noContext(handleExplainTypeError),
};

// =============================================================================
// TEST HANDLERS (moved to project-engine)
// =============================================================================
// const testHandlers: ToolHandlerRegistry = {};

// =============================================================================
// SECURITY HANDLERS
// Secrets scanning and permission checking
// =============================================================================
const securityHandlers: ToolHandlerRegistry = {
  scan_for_secrets: noContext(handleScanForSecrets),
  check_permissions: noContext(handleCheckPermissions),
};

// =============================================================================
// PROJECT HANDLERS
// Environment config and conventions
// =============================================================================
const projectHandlers: ToolHandlerRegistry = {
  get_conventions: noContext(handleGetConventions),
};

// =============================================================================
// FRAMEWORK HANDLERS (moved to project-engine)
// =============================================================================
// const frameworkHandlers: ToolHandlerRegistry = {};

// =============================================================================
// BUILD HANDLERS (moved to project-engine)
// =============================================================================
// const buildHandlers: ToolHandlerRegistry = {};

// =============================================================================
// PROCESS HANDLERS
// Dev server, error watching, health monitoring
// =============================================================================
const processHandlers: ToolHandlerRegistry = {
  start_dev_server: noContext(handleStartDevServer),
  watch_for_errors: noContext(handleWatchForErrors),
  health_monitor: noContext(handleHealthMonitor),
};

// =============================================================================
// RUNTIME HANDLERS
// Browser automation, runtime verification, Lighthouse audits
// =============================================================================
const runtimeHandlers: ToolHandlerRegistry = {
  browser_automation: noContext(handleBrowserAutomation),
  verify_runtime_behavior: noContext(handleVerifyRuntimeBehavior),
  lighthouse_audit: noContext(handleLighthouseAudit),
  visual_regression: noContext(handleVisualRegression),
};

// =============================================================================
// EDIT HANDLERS
// (moved: resolve_merge_conflict → project-engine)
// =============================================================================
const editHandlers: ToolHandlerRegistry = {
  retry_with_learning: noContext(handleRetryWithLearning),
  atomic_multi_edit: noContext(handleAtomicMultiEdit),
  auto_rollback: noContext(handleAutoRollback),
  validate_api_contract: noContext(handleValidateApiContract),
};

// =============================================================================
// ANALYSIS HANDLERS
// (moved: generate_types → project-engine)
// =============================================================================
const analysisHandlers: ToolHandlerRegistry = {
  profile_function: noContext(handleProfileFunction),
  log_analyzer: noContext(handleLogAnalyzer),
  identify_tech_debt: noContext(handleIdentifyTechDebt),
  detect_memory_leaks: noContext(handleDetectMemoryLeaks),
};

// =============================================================================
// DATABASE HANDLERS (moved to project-engine)
// =============================================================================
// const databaseHandlers: ToolHandlerRegistry = {};

// =============================================================================
// ENVIRONMENT HANDLERS
// Environment validation
// =============================================================================
const envHandlers: ToolHandlerRegistry = {
  validate_env_complete: noContext(handleValidateEnvComplete),
};

// =============================================================================
// PACKAGE HANDLERS (moved to project-engine)
// =============================================================================
// const packageHandlers: ToolHandlerRegistry = {};

// =============================================================================
// SYNC HANDLERS (moved to project-engine)
// =============================================================================
// const syncHandlers: ToolHandlerRegistry = {};

// =============================================================================
// FIXTURE HANDLERS (moved to project-engine)
// =============================================================================
// const fixtureHandlers: ToolHandlerRegistry = {};

// =============================================================================
// GIT HANDLERS (moved to project-engine)
// =============================================================================
// const gitHandlers: ToolHandlerRegistry = {};

// =============================================================================
// BATCH HANDLERS
// Bulk operations for multiple files
// =============================================================================
const batchHandlers: ToolHandlerRegistry = {
  batch_read: noContext(handleBatchRead),
  smart_glob: noContext(handleSmartGlob),
  grep_with_content: noContext(handleGrepWithContent),
};

// =============================================================================
// COMBINED REGISTRY
// Merge all category handlers into a single registry for lookup
// =============================================================================

/**
 * Complete registry of all tool handlers.
 * This is the main export used by the MCP server to dispatch tool calls.
 *
 * Usage:
 * ```typescript
 * const handler = TOOL_HANDLERS[toolName];
 * if (handler) {
 *   return await handler(context, args);
 * }
 * throw new Error(`Unknown tool: ${toolName}`);
 * ```
 */
export const TOOL_HANDLERS: ToolHandlerRegistry = {
  // Context gathering
  ...contextHandlers,
  // Documentation
  ...docsHandlers,
  // Schema parsing
  ...schemaHandlers,
  // Validation
  ...validationHandlers,
  // LSP Tools
  ...lspHandlers,
  // Error Tools
  ...errorHandlers,
  // Security
  ...securityHandlers,
  // Project Tools
  ...projectHandlers,
  // Process Management
  ...processHandlers,
  // Runtime Tools
  ...runtimeHandlers,
  // Edit Tools
  ...editHandlers,
  // Analysis Tools
  ...analysisHandlers,
  // Environment Validation
  ...envHandlers,
  // Batch Tools
  ...batchHandlers,
};

/**
 * Get a handler by tool name.
 * Returns undefined if the tool is not registered.
 *
 * @param toolName - The name of the tool to look up
 * @returns The handler function or undefined
 */
export function getHandler(toolName: string): ToolHandlerRegistry[string] | undefined {
  return TOOL_HANDLERS[toolName];
}

/**
 * Check if a tool is registered.
 *
 * @param toolName - The name of the tool to check
 * @returns True if the tool is registered
 */
export function hasHandler(toolName: string): boolean {
  return toolName in TOOL_HANDLERS;
}

/**
 * Get all registered tool names.
 *
 * @returns Array of registered tool names
 */
export function getRegisteredTools(): string[] {
  return Object.keys(TOOL_HANDLERS);
}
