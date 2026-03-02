/**
 * Review-Only Handlers — Removed
 *
 * The L2 review-only workflow handler (registerReviewOnlyHandlers) has been
 * removed. WRFC event routing now flows exclusively through the L3 plugin
 * pipeline (plugins/wrfc).
 *
 * This file is retained as an empty module to avoid breaking any import
 * paths that may still reference it transitively.
 */

// No exports — handler removed. File kept for import path stability.
export {};
