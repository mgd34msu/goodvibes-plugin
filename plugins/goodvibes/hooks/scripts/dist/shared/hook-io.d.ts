/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */
/**
 * Checks if the current process is running in a test environment.
 */
export declare function isTestEnvironment(): boolean;
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
/**
 * Reads and parses hook input from stdin provided by Claude Code.
 */
export declare function readHookInput(): Promise<HookInput>;
/**
 * Creates a hook response that allows the tool to proceed with execution.
 */
export declare function allowTool(hookEventName: string, systemMessage?: string): HookResponse;
/**
 * Blocks the tool from executing.
 */
export declare function blockTool(reason: string): never;
/**
 * Formats a hook response as JSON string.
 */
export declare function formatResponse(response: HookResponse): string;
/**
 * Outputs the hook response as JSON to stdout and exits.
 */
export declare function respond(response: HookResponse, _block?: boolean): never;
/**
 * Options for creating a hook response.
 */
export interface CreateResponseOptions {
    systemMessage?: string;
    additionalContext?: string;
}
/**
 * Extended hook response that includes additionalContext for session-start.
 */
export interface ExtendedHookResponse extends HookResponse {
    additionalContext?: string;
}
/**
 * Creates a standard hook response that allows the hook to continue.
 */
export declare function createResponse(options?: CreateResponseOptions): ExtendedHookResponse;
/**
 * Permission decision type for permission-request hooks.
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask';
/**
 * Creates a hook response for permission request hooks.
 */
export declare function createPermissionResponse(decision?: PermissionDecision, reason?: string): HookResponse;
