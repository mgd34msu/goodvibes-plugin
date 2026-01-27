/**
 * Notification Idle Hook (GoodVibes)
 *
 * Handles idle_prompt notifications from Claude Code.
 * Triggered when Claude is waiting for user input after 60+ seconds of idle time.
 * Used to remind the orchestrator to check agent work and continue the WRFC loop.
 */

import {
  respond,
  readHookInput,
  debug,
  logError,
  isTestEnvironment,
} from './index.js';

import type { HookResponse } from './index.js';

/**
 * The reminder message shown when agents finish and Claude becomes idle.
 * This prompts the orchestrator to verify work and continue the WRFC loop.
 */
const IDLE_PROMPT_MESSAGE =
  'AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!';

/**
 * Creates a hook response with optional system message.
 *
 * @param systemMessage - Optional message to include in the response
 * @returns A HookResponse object with continue=true
 * @internal
 */
function createResponse(systemMessage?: string): HookResponse {
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
async function runNotificationIdleHook(): Promise<void> {
  try {
    debug('Notification idle hook starting');

    const input = await readHookInput();
    debug('Idle notification received', {
      hook_event_name: input.hook_event_name,
      tool_name: input.tool_name,
    });

    // Return the WRFC loop reminder message
    respond(createResponse(IDLE_PROMPT_MESSAGE));
  } catch (error: unknown) {
    logError('Notification idle main', error);
    respond(
      createResponse(
        `Notification idle error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

// Only run the hook if not in test mode
/* v8 ignore start - test environment guard */
if (!isTestEnvironment()) {
  runNotificationIdleHook().catch((error: unknown) => {
    logError('Notification idle uncaught', error);
    respond(
      createResponse(
        `Notification idle error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  });
}
/* v8 ignore stop */

// Export for testing
export { runNotificationIdleHook, createResponse, IDLE_PROMPT_MESSAGE };
