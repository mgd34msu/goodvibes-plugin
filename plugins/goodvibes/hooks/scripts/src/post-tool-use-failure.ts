/* v8 ignore file */
/**
 * Post Tool Use Failure Hook Entry Point
 *
 * This is a thin entry point that re-exports from the post-tool-use-failure module.
 * The actual implementation lives in src/post-tool-use-failure/index.ts
 */

// Re-export and execute the post-tool-use-failure hook
import './post-tool-use-failure/index.js';
