/**
 * Directive Delivery Hook
 *
 * PreToolUse hook with matcher "*" that fires on every tool call.
 * Queries the runtime engine for pending directives (WRFC spawn/complete
 * instructions) and injects them as <gv> tags via hookSpecificOutput.additionalContext
 * so the orchestrator receives them in its conversation context on the next tool call.
 *
 * Fast path: if the runtime engine is not available, responds immediately
 * with allowTool to avoid any IPC overhead.
 */
/**
 * Main entry point for the directive-delivery hook.
 */
export declare function runDirectiveDeliveryHook(): Promise<void>;
