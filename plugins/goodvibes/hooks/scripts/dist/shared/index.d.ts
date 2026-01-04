/**
 * Shared Utilities
 *
 * Central export point for all shared hook utilities.
 */
export type { HookInput, HookResponse, HookSpecificOutput } from './hook-io.js';
export { readHookInput, allowTool, blockTool, respond } from './hook-io.js';
export { debug, logError } from './logging.js';
export type { SharedConfig } from './config.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './config.js';
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './gitignore.js';
export { SECURITY_GITIGNORE_PATTERNS } from './security-patterns.js';
