/**
 * Handler exports for analysis-engine
 *
 * Re-exports all handler functions organized by domain:
 * - context: Stack detection, pattern scanning, conventions
 * - lsp: Dead code, API surface, breaking changes, semantic diff
 * - validation: Implementation validation, edit preview, API contract, env audit
 * - security: Secrets scanning, permissions checking
 * - errors: Stack parsing, type error explanation
 * - deps: Circular dependency detection
 * - analysis: Technical debt identification
 */

// Context
export { handleDetectStack, handleScanPatterns } from './context.js';
export { handleGetConventions } from './config.js';
export { handleReadConfig } from './config.js';
export { handleCheckVersions } from './config.js';

// LSP Tools
export {
  handleFindDeadCode,
  handleGetApiSurface,
  handleDetectBreakingChanges,
  handleSemanticDiff,
  handleSafeDeleteCheck,
  handleValidateEditsPreview,
} from './lsp/index.js';
export type {
  FindDeadCodeArgs,
  GetApiSurfaceArgs,
  DetectBreakingChangesArgs,
  SemanticDiffArgs,
  SafeDeleteCheckArgs,
  ValidateEditsPreviewArgs,
} from './lsp/index.js';

// Validation
export { handleValidateImplementation } from './validation.js';
export { handleValidateEnvComplete } from './env/index.js';
export type { ValidateImplementationArgs } from './validation.js';
export type { ValidateEnvCompleteArgs } from './env/index.js';

// Security
export { handleScanForSecrets, handleCheckPermissions } from './security/index.js';
export type { ScanForSecretsArgs, CheckPermissionsArgs } from './security/index.js';

// Error Tools
export { handleParseErrorStack, handleExplainTypeError } from './errors/index.js';
export type { ParseErrorStackArgs, ExplainTypeErrorArgs } from './errors/index.js';

// Dependency Analysis
export { handleFindCircularDeps } from './deps/index.js';
export type { FindCircularDepsArgs } from './deps/index.js';

// Analysis Tools
export { handleIdentifyTechDebt } from './analysis/index.js';
export type { IdentifyTechDebtArgs } from './analysis/index.js';

// Types
export type { HandlerContext, ToolHandlerResponse } from './types.js';
