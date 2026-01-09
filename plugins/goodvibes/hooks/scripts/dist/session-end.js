/* v8 ignore file */
/**
 * Session End Hook Entry Point
 *
 * This is a thin entry point that re-exports from the session-end module.
 * The actual implementation lives in src/session-end/index.ts
 */
// Re-export and execute the session-end hook
import './session-end/index.js';
