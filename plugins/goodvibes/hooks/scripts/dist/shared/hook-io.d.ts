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
 * Reads and parses hook input from stdin provided by Claude Code.
 *
 * Waits for JSON input on stdin, parses it, and validates the structure.
 * If no input is received within the timeout period, rejects with an error.
 *
 * @returns A promise that resolves to the parsed hook input
 * @throws Error if the JSON is malformed, doesn't match the HookInput structure, or timeout occurs
 *
 * @example
 * const input = await readHookInput();
 * console.log(input.hook_event_name); // 'PreToolUse'
 * console.log(input.tool_name); // 'Bash'
 */
export declare function readHookInput(): Promise<HookInput>;
/**
 * Creates a hook response that allows the tool to proceed with execution.
 *
 * Use this when the hook determines the tool operation should be permitted.
 * Optionally includes a system message that will be shown to the AI.
 *
 * @param hookEventName - The name of the hook event (e.g., 'PreToolUse', 'PermissionRequest')
 * @param systemMessage - Optional message to inject into the conversation context
 * @returns A HookResponse object with continue=true and allow decision
 *
 * @example
 * // Allow a Bash command with no message
 * respond(allowTool('PreToolUse'));
 *
 * @example
 * // Allow with a helpful system message
 * respond(allowTool('PreToolUse', 'Remember to run tests after this change'));
 */
export declare function allowTool(hookEventName: string, systemMessage?: string): HookResponse;
/**
 * Creates a hook response that blocks the tool from executing.
 *
 * Use this when the hook determines the tool operation should be denied.
 * The reason is displayed to explain why the operation was blocked.
 *
 * @param hookEventName - The name of the hook event (e.g., 'PreToolUse', 'PermissionRequest')
 * @param reason - Human-readable explanation for why the tool was blocked
 * @returns A HookResponse object with continue=false and deny decision
 *
 * @example
 * // Block a dangerous command
 * respond(blockTool('PreToolUse', 'rm -rf commands are not permitted'), true);
 *
 * @example
 * // Block due to security policy
 * respond(blockTool('PermissionRequest', 'Access to .env files is restricted'));
 */
export declare function blockTool(hookEventName: string, reason: string): HookResponse;
/**
 * Formats a hook response as JSON string (pure function).
 *
 * This is a pure formatting function that converts a HookResponse object
 * to its JSON string representation. Use this when you need to format
 * a response without side effects (no console output or process exit).
 *
 * @param response - The HookResponse object to format
 * @returns JSON string representation of the response
 *
 * @example
 * const jsonString = formatResponse(allowTool('PreToolUse'));
 * // Returns: '{"continue":true,"hookSpecificOutput":{...}}'
 *
 * @example
 * // Use in tests or where you need formatted output without exiting
 * const formatted = formatResponse(createResponse({ systemMessage: 'Test' }));
 * console.log(formatted);
 */
export declare function formatResponse(response: HookResponse): string;
/**
 * Outputs the hook response as JSON to stdout and exits the process.
 *
 * This is the final call in any hook script. It serializes the response
 * to JSON and exits with the appropriate code:
 * - Exit 0: Success (tool proceeds or is allowed)
 * - Exit 2: Blocking error (tool is denied)
 *
 * @param response - The HookResponse object to output
 * @param block - If true, exits with code 2 to indicate a blocking action
 * @returns never - This function exits the process and never returns
 *
 * @example
 * // Allow the tool to proceed
 * respond(allowTool('PreToolUse'));
 *
 * @example
 * // Block the tool with exit code 2
 * respond(blockTool('PreToolUse', 'Operation not permitted'), true);
 */
export declare function respond(response: HookResponse, block?: boolean): never;
/**
 * Options for creating a hook response.
 */
export interface CreateResponseOptions {
    /** Optional system message to inject into conversation context. */
    systemMessage?: string;
    /** Optional additional context (used by some hooks like session-start). */
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
 *
 * This is a unified utility for creating hook responses across all hook types.
 * Use this for hooks that don't need permission decisions (session-start,
 * pre-compact, user-prompt-submit, post-tool-use-failure, stop, etc.).
 *
 * @param options - Optional configuration for the response
 * @returns A HookResponse object with continue=true
 *
 * @example
 * // Simple continue response
 * respond(createResponse());
 *
 * @example
 * // With a system message
 * respond(createResponse({ systemMessage: 'Plugin initialized' }));
 *
 * @example
 * // With additional context (for session-start)
 * respond(createResponse({
 *   systemMessage: 'GoodVibes ready',
 *   additionalContext: projectContextString
 * }));
 */
export declare function createResponse(options?: CreateResponseOptions): ExtendedHookResponse;
/**
 * Permission decision type for permission-request hooks.
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask';
/**
 * Creates a hook response for permission request hooks.
 *
 * Use this for the permission-request hook which needs to return
 * a hookSpecificOutput with the permission decision.
 *
 * @param decision - The permission decision ('allow', 'deny', or 'ask')
 * @param reason - Optional reason for the decision (useful for 'deny')
 * @returns A HookResponse object with the permission decision
 *
 * @example
 * // Auto-approve a tool
 * respond(createPermissionResponse('allow'));
 *
 * @example
 * // Let user decide
 * respond(createPermissionResponse('ask'));
 *
 * @example
 * // Deny with reason
 * respond(createPermissionResponse('deny', 'Tool not permitted'));
 */
export declare function createPermissionResponse(decision?: PermissionDecision, reason?: string): HookResponse;
