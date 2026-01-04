/**
 * Shared Utilities
 *
 * Central export point for all shared hook utilities.
 */
export { readHookInput, allowTool, blockTool, respond } from './hook-io.js';
// Logging
export { debug, logError } from './logging.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './config.js';
// Gitignore Management
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './gitignore.js';
