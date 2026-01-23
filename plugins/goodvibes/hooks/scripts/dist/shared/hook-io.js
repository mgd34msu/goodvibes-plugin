/**
 * Hook I/O
 *
 * Functions for reading hook input from stdin and responding with hook output.
 */
import { STDIN_TIMEOUT_MS } from './config.js';
/**
 * Checks if the current process is running in a test environment.
 * This is used to prevent hook scripts from executing when being imported by tests.
 *
 * @returns true if running in test mode, false otherwise
 */
/* v8 ignore start - Test environment detection is inherently untestable:
   When tests run, NODE_ENV/VITEST/__vitest_worker__ are always set,
   making it impossible to test the false branch without complex isolation.
   Tests verify all code paths via mocking in shared/hook-io.test.ts. */
export function isTestEnvironment() {
    return (process.env.NODE_ENV === 'test' ||
        process.env.VITEST === 'true' ||
        typeof globalThis.__vitest_worker__ !==
            'undefined');
}
/* v8 ignore stop */
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
 *
 * Waits for JSON input on stdin, parses it, and validates the structure.
 * If no input is received within the timeout period, rejects with an error.
 *
 * @returns A promise that resolves to the parsed hook input
 * @throws Error if the JSON is malformed, doesn't match the HookInput structure, or timeout occurs
 *
 * @example
 * const input = await readHookInput();
 * // => { session_id: '123', cwd: '/project', hook_event_name: 'PreToolUse', tool_name: 'Bash', ... }
 */
export async function readHookInput() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                if (!isValidHookInput(parsed)) {
                    reject(new Error('Invalid hook input structure'));
                    return;
                }
                resolve(parsed);
            }
            catch {
                reject(new Error('Failed to parse hook input from stdin'));
            }
        });
        process.stdin.on('error', reject);
        // Handle case where no stdin is provided (timeout after configured delay)
        setTimeout(() => {
            if (!data) {
                reject(new Error('Hook input timeout: no data received within configured timeout'));
            }
        }, STDIN_TIMEOUT_MS);
    });
}
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
 * const response = allowTool('PreToolUse');
 * // => { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }
 *
 * @example
 * const response = allowTool('PreToolUse', 'Remember to run tests');
 * // => { continue: true, systemMessage: 'Remember...', hookSpecificOutput: {...} }
 */
export function allowTool(hookEventName, systemMessage) {
    return {
        continue: true,
        systemMessage,
        hookSpecificOutput: {
            hookEventName,
            permissionDecision: 'allow',
        },
    };
}
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
 * const response = blockTool('PreToolUse', 'rm -rf commands are not permitted');
 * // => { continue: false, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '...' } }
 */
export function blockTool(hookEventName, reason) {
    return {
        hookSpecificOutput: {
            hookEventName,
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    };
}
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
 * // => '{"continue":true,"hookSpecificOutput":{...}}'
 */
export function formatResponse(response) {
    return JSON.stringify(response);
}
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
 * respond(allowTool('PreToolUse'));
 * // Outputs JSON to stdout and exits with code 0
 *
 * @example
 * respond(blockTool('PreToolUse', 'Operation not permitted'), true);
 * // Outputs JSON to stdout and exits with code 2
 */
export function respond(response, _block = false) {
    console.log(formatResponse(response));
    // Always exit 0 - blocking is handled by permissionDecision: 'deny' in the JSON response
    process.exit(0);
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
 * const response = createResponse();
 * // => { continue: true }
 *
 * @example
 * const response = createResponse({ systemMessage: 'Plugin initialized' });
 * // => { continue: true, systemMessage: 'Plugin initialized' }
 *
 * @example
 * const response = createResponse({ additionalContext: '# Project Context\n...' });
 * // => { continue: true, additionalContext: '# Project Context\n...' }
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
 *
 * Use this for the permission-request hook which needs to return
 * a hookSpecificOutput with the permission decision.
 *
 * @param decision - The permission decision ('allow', 'deny', or 'ask')
 * @param reason - Optional reason for the decision (useful for 'deny')
 * @returns A HookResponse object with the permission decision
 *
 * @example
 * const response = createPermissionResponse('allow');
 * // => { continue: true, hookSpecificOutput: { hookEventName: 'PermissionRequest', permissionDecision: 'allow' } }
 *
 * @example
 * const response = createPermissionResponse('deny', 'Tool not permitted');
 * // => { continue: true, hookSpecificOutput: { ..., permissionDecision: 'deny', permissionDecisionReason: '...' } }
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
