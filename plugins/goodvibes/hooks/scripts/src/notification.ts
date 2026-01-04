/**
 * Notification Hook (GoodVibes)
 *
 * Handles notifications from Claude Code:
 * - Validation failures
 * - Test failures
 * - Build errors
 */

import {
  respond,
  readHookInput,
  debug,
  logError,
  HookResponse,
} from './shared.js';

/** Creates a hook response with optional system message. */
function createResponse(systemMessage?: string): HookResponse {
  return {
    continue: true,
    systemMessage,
  };
}

/** Main entry point for notification hook. Handles validation, test, and build error notifications. */
async function main(): Promise<void> {
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

  } catch (error) {
    logError('Notification main', error);
    respond(createResponse(`Notification error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

main();
