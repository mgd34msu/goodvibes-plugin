/**
 * Code Intelligence Extensions — Barrel Export
 *
 * Re-exports all L2 code-intel orchestration functions.
 *
 * Architectural note: This domain intentionally skips the L3 handler layer.
 * The L2 extensions (breaking-changes, dead-code, etc.) connect directly to
 * the dispatch layer. The handlers/code-intelligence/ directory exists with a
 * shared/ subdirectory for any shared utilities, but no L3 handler files are
 * needed for this domain's current tool surface.
 *
 * @module extensions/code-intel
 */

export { findDeadCode } from './dead-code.js';
export { checkSafeDelete } from './safe-delete.js';
export { validateEditsPreview } from './preview-edits.js';
export { detectBreakingChanges } from './breaking-changes.js';
export { semanticDiff } from './semantic-diff.js';
export { getApiSurface } from './api-surface.js';
