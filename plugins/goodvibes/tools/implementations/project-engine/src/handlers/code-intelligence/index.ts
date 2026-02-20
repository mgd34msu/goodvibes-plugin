/**
 * Code Intelligence domain handlers.
 *
 * Provides 6 tools for TypeScript code analysis using the Language Service:
 * - project_code_dead: Find unused exports
 * - project_code_safe_delete: Verify zero usages before deletion
 * - project_code_preview_edits: Preview TypeScript errors before applying edits
 * - project_code_breaking: Detect breaking API changes
 * - project_code_semantic_diff: Type-aware semantic diff
 * - project_code_surface: Analyze public vs internal API surface
 */

export { handleFindDeadCode } from './dead-code.js';
export { handleSafeDeleteCheck } from './safe-delete.js';
export { handleValidateEditsPreview } from './preview-edits.js';
export { handleDetectBreakingChanges } from './breaking-changes.js';
export { handleSemanticDiff } from './semantic-diff.js';
export { handleGetApiSurface } from './api-surface.js';
export { languageServiceManager } from './shared/language-service.js';
