/**
 * Shared utilities for GoodVibes hook scripts
 */
export declare const PLUGIN_ROOT: string;
export declare const PROJECT_ROOT: string;
export declare const CACHE_DIR: string;
export declare const ANALYTICS_FILE: string;
export interface HookResponse {
    decision?: 'allow' | 'block';
    reason?: string;
    continue?: boolean;
    systemMessage?: string;
    suppressOutput?: boolean;
}
export interface ToolUsage {
    tool: string;
    timestamp: string;
    duration_ms?: number;
    success: boolean;
    args?: Record<string, unknown>;
}
export interface SessionAnalytics {
    session_id: string;
    started_at: string;
    ended_at?: string;
    tool_usage: ToolUsage[];
    skills_recommended: string[];
    validations_run: number;
    issues_found: number;
}
/**
 * Output hook response as JSON
 */
export declare function respond(response: HookResponse): void;
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
 * Check if a command is available
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
