/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */
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
 * Output hook response as JSON and exit with appropriate code
 * Exit 0 = success, Exit 2 = blocking error
 */
export declare function respond(response: HookResponse, block?: boolean): void;
