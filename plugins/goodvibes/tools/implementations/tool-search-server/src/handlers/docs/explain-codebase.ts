/**
 * Explain Codebase Handler - Re-export
 *
 * This file re-exports from the modular explain-codebase/ directory
 * for backward compatibility with existing imports.
 *
 * @module handlers/docs/explain-codebase
 * @deprecated Import from './explain-codebase/index.js' instead
 */

// Re-export everything from the new modular structure
export { handleExplainCodebase } from './explain-codebase/index.js';
export type { ExplainCodebaseArgs } from './explain-codebase/index.js';
