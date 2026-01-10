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

// Get Implementations
export { handleGetImplementations } from './get-implementations.js';
export type { GetImplementationsArgs } from './get-implementations.js';

// Rename Symbol
export { handleRenameSymbol } from './rename-symbol.js';
export type { RenameSymbolArgs } from './rename-symbol.js';

// Code Actions
export { handleGetCodeActions, handleApplyCodeAction } from './code-actions.js';
export type { GetCodeActionsArgs, ApplyCodeActionArgs } from './code-actions.js';

// Call Hierarchy
export { handleGetCallHierarchy } from './call-hierarchy.js';
export type { GetCallHierarchyArgs } from './call-hierarchy.js';

// Symbol Info
export { handleGetSymbolInfo } from './symbol-info.js';
export type { GetSymbolInfoArgs } from './symbol-info.js';

// Signature Help
export { handleGetSignatureHelp } from './signature-help.js';
export type { GetSignatureHelpArgs } from './signature-help.js';

// Document Symbols
export { handleGetDocumentSymbols } from './document-symbols.js';
export type { GetDocumentSymbolsArgs } from './document-symbols.js';

// Diagnostics
export { handleGetDiagnostics } from './diagnostics.js';
export type { GetDiagnosticsArgs } from './diagnostics.js';

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

// Inlay Hints
export { handleGetInlayHints } from './inlay-hints.js';
export type { GetInlayHintsArgs } from './inlay-hints.js';

// Workspace Symbols
export { handleWorkspaceSymbols } from './workspace-symbols.js';
export type { WorkspaceSymbolsArgs } from './workspace-symbols.js';

// Safe Delete Check
export { handleSafeDeleteCheck } from './safe-delete-check.js';
export type { SafeDeleteCheckArgs } from './safe-delete-check.js';

// Validate Edits Preview
export { handleValidateEditsPreview } from './validate-edits-preview.js';
export type { ValidateEditsPreviewArgs } from './validate-edits-preview.js';

// Type Hierarchy
export { handleGetTypeHierarchy } from './type-hierarchy.js';
export type { GetTypeHierarchyArgs } from './type-hierarchy.js';
