/**
 * Shared Utilities
 *
 * Central export point for all shared hook utilities.
 * This is the canonical barrel file - all imports should come from here.
 */
/** Core hook input/output types for all hook implementations */
export type { HookInput, HookResponse, HookSpecificOutput, CreateResponseOptions, ExtendedHookResponse, PermissionDecision, } from './hook-io.js';
export { readHookInput, allowTool, blockTool, formatResponse, respond, createResponse, createPermissionResponse, isTestEnvironment, } from './hook-io.js';
export { debug, logError } from './logging.js';
/** Configuration type for shared hook settings */
export type { SharedConfig } from './config.js';
export { STDIN_TIMEOUT_MS, CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig, } from './config.js';
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore, } from './gitignore.js';
export { SECURITY_GITIGNORE_PATTERNS } from './security-patterns.js';
export { LOCKFILES, PLUGIN_ROOT, PROJECT_ROOT, CACHE_DIR, ANALYTICS_FILE, } from './constants.js';
/** Analytics data types for tracking tool usage and session metrics */
export type { ToolUsage, ToolFailure, SubagentSpawn, SessionAnalytics, } from './analytics.js';
export { ensureCacheDir, loadAnalytics, saveAnalytics, getSessionId, logToolUsage, } from './analytics.js';
export { fileExists, fileExistsRelative, commandExists, validateRegistries, ensureGoodVibesDir, extractErrorOutput, } from './file-utils.js';
/** Transcript parsing data types */
export type { TranscriptData } from './transcript.js';
export { parseTranscript } from './transcript.js';
export { KEYWORD_CATEGORIES, ALL_KEYWORDS, STACK_KEYWORD_CATEGORIES, TRANSCRIPT_KEYWORD_CATEGORIES, ALL_STACK_KEYWORDS, ALL_TRANSCRIPT_KEYWORDS, extractStackKeywords, extractStackKeywords as extractKeywords, extractTranscriptKeywords, } from './keywords.js';
/** Hook runner types for standardized hook execution */
export type { HookHandler, RunHookOptions } from './hook-runner.js';
export { runHook, runHookSync, isMainModule } from './hook-runner.js';
