/**
 * Shared utilities for GoodVibes hook scripts
 *
 * This file maintains backwards compatibility by re-exporting from
 * the split modules in src/shared/
 */
export type { HookInput, HookResponse, HookSpecificOutput } from './shared/hook-io.js';
export { readHookInput, allowTool, blockTool, respond } from './shared/hook-io.js';
export { debug, logError } from './shared/logging.js';
export type { SharedConfig } from './shared/config.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './shared/config.js';
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './shared/gitignore.js';
/** Package manager lockfiles for detection. */
export declare const LOCKFILES: readonly ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb"];
export declare const PLUGIN_ROOT: string;
export declare const PROJECT_ROOT: string;
export declare const CACHE_DIR: string;
export declare const ANALYTICS_FILE: string;
/** Represents a single tool usage event for analytics. */
export interface ToolUsage {
    tool: string;
    timestamp: string;
    duration_ms?: number;
    success: boolean;
    args?: Record<string, unknown>;
}
/** Represents a tool failure event for analytics. */
export interface ToolFailure {
    tool: string;
    error: string;
    timestamp: string;
}
/** Represents a subagent spawn event for analytics. */
export interface SubagentSpawn {
    type: string;
    task: string;
    started_at: string;
    completed_at?: string;
    success?: boolean;
}
/** Aggregated analytics for a session. */
export interface SessionAnalytics {
    session_id: string;
    started_at: string;
    ended_at?: string;
    tool_usage: ToolUsage[];
    tool_failures?: ToolFailure[];
    skills_recommended: string[];
    subagents_spawned?: SubagentSpawn[];
    validations_run: number;
    issues_found: number;
    detected_stack?: Record<string, unknown>;
}
/**
 * Ensure cache directory exists
 */
export declare function ensureCacheDir(): void;
/**
 * Load analytics from file
 */
export declare function loadAnalytics(): SessionAnalytics | null;
/**
 * Save analytics to file
 */
export declare function saveAnalytics(analytics: SessionAnalytics): void;
/**
 * Check if a command is available (cross-platform)
 */
export declare function commandExists(cmd: string): boolean;
/**
 * Check if a file exists
 */
export declare function fileExists(filePath: string): boolean;
/**
 * Check if registries are valid
 */
export declare function validateRegistries(): {
    valid: boolean;
    missing: string[];
};
/**
 * Get current session ID (or create one)
 */
export declare function getSessionId(): string;
/**
 * Log a tool usage event
 */
export declare function logToolUsage(usage: ToolUsage): void;
/**
 * Ensure .goodvibes directory exists with all required subdirectories
 */
export declare function ensureGoodVibesDir(cwd: string): Promise<string>;
/** Keyword categories for telemetry and stack detection. */
export declare const KEYWORD_CATEGORIES: Record<string, string[]>;
/** Flat list of all keywords across all categories. */
export declare const ALL_KEYWORDS: string[];
/**
 * Extract known keywords from text
 */
export declare function extractKeywords(text: string): string[];
/** Parsed transcript data containing tools used and files modified. */
export interface TranscriptData {
    toolsUsed: string[];
    filesModified: string[];
    summary: string;
}
/**
 * Parse a Claude Code transcript file to extract tools used and files modified
 */
export declare function parseTranscript(transcriptPath: string): TranscriptData;
/**
 * Extract error output from an exec error (child_process execSync failures)
 */
export declare function extractErrorOutput(error: unknown): string;
