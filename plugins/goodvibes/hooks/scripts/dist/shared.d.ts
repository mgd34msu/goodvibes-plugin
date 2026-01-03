/**
 * Shared utilities for GoodVibes hook scripts
 */
export declare const PLUGIN_ROOT: string;
export declare const PROJECT_ROOT: string;
export declare const CACHE_DIR: string;
export declare const ANALYTICS_FILE: string;
export interface HookInput {
    session_id: string;
    transcript_path: string;
    cwd: string;
    permission_mode: string;
    hook_event_name: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
}
export interface HookSpecificOutput {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
}
export interface HookResponse {
    continue?: boolean;
    stopReason?: string;
    suppressOutput?: boolean;
    systemMessage?: string;
    hookSpecificOutput?: HookSpecificOutput;
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
 * Read hook input from stdin
 */
export declare function readHookInput(): Promise<HookInput>;
/**
 * Create a response that allows the tool to proceed
 */
export declare function allowTool(hookEventName: string, systemMessage?: string): HookResponse;
/**
 * Create a response that blocks the tool
 */
export declare function blockTool(hookEventName: string, reason: string): HookResponse;
/**
 * Log debug message to stderr (visible in Claude Code logs but won't affect hook response)
 */
export declare function debug(message: string, data?: unknown): void;
/**
 * Log error to stderr with full stack trace
 */
export declare function logError(context: string, error: unknown): void;
/**
 * Output hook response as JSON and exit with appropriate code
 * Exit 0 = success, Exit 2 = blocking error
 */
export declare function respond(response: HookResponse, block?: boolean): void;
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
