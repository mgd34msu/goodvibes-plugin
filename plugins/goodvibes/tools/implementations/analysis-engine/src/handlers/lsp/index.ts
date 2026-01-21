/**
 * LSP handlers
 *
 * Provides TypeScript Language Server Protocol tools for code intelligence:
 * - Type information and definitions
 * - Symbol search and navigation
 * - Diagnostics and code analysis
 *
 * All LSP tools share the LanguageServiceManager for efficient caching.
 */

// Language Service infrastructure
export {
  languageServiceManager,
  type LanguageServiceManager,
  type LanguageServiceResult,
} from './language-service.js';

// Shared utilities
export {
  createSuccessResponse,
  createErrorResponse,
  normalizeFilePath,
  makeRelativePath,
  resolveFilePath,
  getLinePreview,
  getPreviewFromSourceFile,
  type ToolResponse,
} from './utils.js';

// Validation utilities
export {
  validatePositionArgs,
  validateFilePath,
  isValidLine,
  isValidColumn,
  type PositionArgs,
  type ValidationResult,
} from './validation.js';

// Dead Code Analysis
export { handleFindDeadCode } from './dead-code.js';
export type { FindDeadCodeArgs } from './dead-code.js';

// API Surface Analysis
export { handleGetApiSurface } from './api-surface.js';
export type { GetApiSurfaceArgs } from './api-surface.js';

// Breaking Changes (LLM-powered)
export { handleDetectBreakingChanges } from './breaking-changes.js';
export type { DetectBreakingChangesArgs } from './breaking-changes.js';

// Semantic Diff (LLM-powered)
export { handleSemanticDiff } from './semantic-diff.js';
export type { SemanticDiffArgs } from './semantic-diff.js';

// Safe Delete Check
export { handleSafeDeleteCheck } from './safe-delete-check.js';
export type { SafeDeleteCheckArgs } from './safe-delete-check.js';

// Validate Edits Preview
export { handleValidateEditsPreview } from './validate-edits-preview.js';
export type { ValidateEditsPreviewArgs } from './validate-edits-preview.js';
