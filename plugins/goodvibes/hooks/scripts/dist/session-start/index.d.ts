/**
 * Session Start Hook
 *
 * Initializes the GoodVibes plugin:
 * - Loads or initializes persistent state
 * - Checks for crash recovery scenarios
 * - Validates registries exist
 * - Creates cache directory
 * - Initializes analytics
 * - Gathers and injects project context (Smart Context Injection)
 * - Updates session state (increment session count, record start time)
 * - Saves state for future sessions
 */
export { formatRecoveryContext, checkCrashRecovery } from './crash-recovery.js';
export { buildSystemMessage } from './response-formatter.js';
export { gatherProjectContext, createFailedContextResult, } from './context-builder.js';
export { gatherAndFormatContext } from './context-injection.js';
