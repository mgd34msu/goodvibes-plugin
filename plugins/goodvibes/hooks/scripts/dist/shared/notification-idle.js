/**
 * Notification Idle Hook (GoodVibes)
 *
 * Handles idle_prompt notifications from Claude Code.
 * Triggered when Claude is waiting for user input after 60+ seconds of idle time.
 * Used to remind the orchestrator to check agent work and continue the WRFC loop.
 *
 */
import { respond, readHookInput, debug, logError, } from './index.js';
/**
 * The reminder message shown when agents finish and Claude becomes idle.
 * This prompts the orchestrator to verify work and continue the WRFC loop.
 */
const IDLE_PROMPT_MESSAGE = 'CRITICAL: IF YOU ARE WORKING ON A LONG TASK CHECK IF AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!';
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
 * Main entry point for notification idle hook.
 *
 * Handles idle_prompt notifications from Claude Code. When triggered,
 * returns a system message reminding the orchestrator to check completed
 * agent work, commit verified changes, and continue the WRFC loop.
 *
 * @internal
 */
async function runNotificationIdleHook() {
    try {
        debug('Notification idle hook starting');
        const input = await readHookInput();
        debug('Idle notification received', {
            hook_event_name: input.hook_event_name,
            tool_name: input.tool_name,
        });
        // Return the WRFC loop reminder message
        respond(createResponse(IDLE_PROMPT_MESSAGE));
    }
    catch (error) {
        logError('Notification idle main', error);
        respond(createResponse(`Notification idle error: ${error instanceof Error ? error.message : String(error)}`));
    }
}
runNotificationIdleHook().catch((error) => {
    logError('Notification idle uncaught', error);
    respond(createResponse(`Notification idle error: ${error instanceof Error ? error.message : String(error)}`));
});
// Export for testing
export { runNotificationIdleHook, createResponse, IDLE_PROMPT_MESSAGE };
