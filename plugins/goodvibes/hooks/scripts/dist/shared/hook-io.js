/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */
import { stdin } from 'process';
/**
 * Checks if the current process is running in a test environment.
 */
export function isTestEnvironment() {
    return (process.env.NODE_ENV === 'test' ||
        process.env.VITEST === 'true' ||
        typeof globalThis.__vitest_worker__ !==
            'undefined');
}
/**
 * Type guard to validate hook input structure at runtime
 */
function isValidHookInput(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const obj = value;
    return (typeof obj.session_id === 'string' &&
        typeof obj.cwd === 'string' &&
        typeof obj.hook_event_name === 'string');
}
/**
 * Reads and parses hook input from stdin provided by Claude Code.
 */
export async function readHookInput() {
    const chunks = [];
    for await (const chunk of stdin) {
        chunks.push(chunk);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    if (!isValidHookInput(parsed)) {
        throw new Error('Invalid hook input structure');
    }
    return parsed;
}
/**
 * Creates a hook response that allows the tool to proceed with execution.
 */
export function allowTool(hookEventName, additionalContext, updatedInput) {
    return {
        continue: true,
        hookSpecificOutput: {
            hookEventName,
            permissionDecision: 'allow',
            additionalContext,
            updatedInput,
        },
    };
}
/**
 * Creates a hook response that blocks the tool from executing.
 */
export function blockTool(hookEventName, reason) {
    return {
        continue: false,
        hookSpecificOutput: {
            hookEventName,
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    };
}
/**
 * Formats a hook response as JSON string.
 */
export function formatResponse(response) {
    return JSON.stringify(response);
}
/**
 * Outputs the hook response as JSON to stdout and exits.
 */
export function respond(response, _block = false) {
    console.log(formatResponse(response));
    process.exit(0);
}
/**
 * Creates a standard hook response that allows the hook to continue.
 */
export function createResponse(options = {}) {
    const response = {
        continue: true,
    };
    if (options.systemMessage !== undefined) {
        response.systemMessage = options.systemMessage;
    }
    if (options.additionalContext !== undefined) {
        response.additionalContext = options.additionalContext;
    }
    return response;
}
/**
 * Creates a hook response for permission request hooks.
 */
export function createPermissionResponse(decision = 'allow', reason) {
    const response = {
        continue: true,
        hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            permissionDecision: decision,
        },
    };
    if (reason && response.hookSpecificOutput) {
        response.hookSpecificOutput.permissionDecisionReason = reason;
    }
    return response;
}
