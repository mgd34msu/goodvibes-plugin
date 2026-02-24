/**
 * Notification Hook (GoodVibes)
 *
 * Handles notifications from Claude Code:
 * - Validation failures
 * - Test failures
 * - Build errors
 */
import { respond, readHookInput, debug, logError, isTestEnvironment, } from './index.js';
/**
 * Creates a hook response with optional system message.
 *
 * @param systemMessage - Optional message to include in the response
 * @returns A HookResponse object with continue=true
 * @internal
 */
function createResponse(systemMessage) {
    return {
        continue: true,
        systemMessage,
    };
}
/**
 * Main entry point for notification hook.
 *
 * Handles notifications from Claude Code including validation failures,
 * test failures, and build errors. Can be extended to send notifications
 * to external services or log files.
 *
 * @internal
 */
async function runNotificationHook() {
    try {
        debug('Notification hook starting');
        const input = await readHookInput();
        debug('Notification received', {
            hook_event_name: input.hook_event_name,
            tool_name: input.tool_name,
        });
        // Could send to external service, log file, etc.
        // For now, just acknowledge
        respond(createResponse());
    }
    catch (error) {
        logError('Notification main', error);
        respond(createResponse(`Notification error: ${error instanceof Error ? error.message : String(error)}`));
    }
}
// Only run the hook if not in test mode
/* v8 ignore start - test environment guard */
if (!isTestEnvironment()) {
    runNotificationHook().catch((error) => {
        logError('Notification uncaught', error);
        respond(createResponse(`Notification error: ${error instanceof Error ? error.message : String(error)}`));
    });
}
/* v8 ignore stop */
