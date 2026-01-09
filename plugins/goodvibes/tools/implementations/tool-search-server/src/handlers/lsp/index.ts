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

// Find References
export { handleFindReferences } from './find-references.js';
export type { FindReferencesArgs } from './find-references.js';

// Go To Definition
export { handleGoToDefinition } from './go-to-definition.js';
export type { GoToDefinitionArgs } from './go-to-definition.js';

// Rename Symbol
export { handleRenameSymbol } from './rename-symbol.js';
export type { RenameSymbolArgs } from './rename-symbol.js';

// Code Actions
export { handleGetCodeActions, handleApplyCodeAction } from './code-actions.js';
export type { GetCodeActionsArgs, ApplyCodeActionArgs } from './code-actions.js';
