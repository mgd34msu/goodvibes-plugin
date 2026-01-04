/**
 * Shared utilities for GoodVibes hook scripts
 */
export declare const PLUGIN_ROOT: string;
export declare const PROJECT_ROOT: string;
export declare const CACHE_DIR: string;
export declare const ANALYTICS_FILE: string;
/** Hook input from stdin (provided by Claude Code). */
export interface HookInput {
    session_id: string;
    transcript_path: string;
    cwd: string;
    permission_mode: string;
    hook_event_name: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
}
/** Hook-specific output for PreToolUse/PermissionRequest events. */
export interface HookSpecificOutput {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
}
/** Hook response type (official Claude Code schema). */
export interface HookResponse {
    continue?: boolean;
    stopReason?: string;
    suppressOutput?: boolean;
    systemMessage?: string;
    hookSpecificOutput?: HookSpecificOutput;
}
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
/**
 * Ensure .gitignore contains security-critical entries
 */
export declare function ensureSecureGitignore(cwd: string): Promise<void>;
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
/** Triggers that determine when quality checkpoints should run. */
export declare const CHECKPOINT_TRIGGERS: {
    fileCountThreshold: number;
    afterAgentComplete: boolean;
    afterMajorChange: boolean;
};
/** Default quality gate checks with auto-fix commands. */
export declare const QUALITY_GATES: ({
    name: string;
    check: string;
    autoFix: null;
    blocking: boolean;
} | {
    name: string;
    check: string;
    autoFix: string;
    blocking: boolean;
})[];
/**
 * Shared configuration for GoodVibes hooks (telemetry, quality, memory, checkpoints).
 * Note: This is separate from the automation config in ./types/config.ts which
 * handles build/test/git automation settings.
 */
export interface SharedConfig {
    telemetry?: {
        enabled?: boolean;
        anonymize?: boolean;
    };
    quality?: {
        gates?: Array<{
            name: string;
            check: string;
            autoFix: string | null;
            blocking: boolean;
        }>;
        autoFix?: boolean;
    };
    memory?: {
        enabled?: boolean;
        maxEntries?: number;
    };
    checkpoints?: {
        enabled?: boolean;
        triggers?: typeof CHECKPOINT_TRIGGERS;
    };
}
/**
 * Get default shared configuration
 */
export declare function getDefaultSharedConfig(): SharedConfig;
/**
 * Load shared configuration from .goodvibes/settings.json
 */
export declare function loadSharedConfig(cwd: string): SharedConfig;
