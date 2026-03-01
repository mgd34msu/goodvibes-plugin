/**
 * Code Intelligence Extensions — Barrel Export
 *
 * Re-exports all L2 code-intel orchestration functions.
 *
 * @module extensions/code-intel
 */

export { findDeadCode } from './dead-code.js';
export { checkSafeDelete } from './safe-delete.js';
export { validateEditsPreview } from './preview-edits.js';
export { detectBreakingChanges } from './breaking-changes.js';
export { semanticDiff } from './semantic-diff.js';
export { getApiSurface } from './api-surface.js';
