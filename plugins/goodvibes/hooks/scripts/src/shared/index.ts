/**
 * Shared Utilities
 *
 * Central export point for all shared hook utilities.
 */

// Hook I/O
export type { HookInput, HookResponse, HookSpecificOutput } from './hook-io.js';
export { readHookInput, allowTool, blockTool, respond } from './hook-io.js';

// Logging
export { debug, logError } from './logging.js';

// Configuration
export type { SharedConfig } from './config.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './config.js';

// Gitignore Management
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './gitignore.js';
