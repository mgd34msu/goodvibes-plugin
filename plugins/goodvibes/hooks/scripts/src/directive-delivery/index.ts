/**
 * Directive Delivery Hook
 *
 * PreToolUse hook with matcher "*" that fires on every tool call.
 * Queries the runtime engine for pending directives (WRFC spawn/complete
 * instructions) and injects them as <gv> tags in the systemMessage so
 * the orchestrator receives them on its next tool call.
 *
 * Fast path: if the runtime engine is not available, responds immediately
 * with allowTool to avoid any IPC overhead.
 */

import {
  respond,
  readHookInput,
  allowTool,
  logError,
  isTestEnvironment,
} from '../shared/index.js';
import { RuntimeClient } from '../shared/runtime-client.js';

/**
 * Main entry point for the directive-delivery hook.
 */
export async function runDirectiveDeliveryHook(): Promise<void> {
  try {
    // Read hook input (required even if unused — drains stdin)
    await readHookInput();

    const runtimeClient = new RuntimeClient();

    // Fast path: runtime not available — no IPC overhead
    if (!runtimeClient.isAvailable()) {
      respond(allowTool('PreToolUse'));
      return;
    }

    // Query runtime for pending directives
    const result = await runtimeClient.query({ kind: 'get_directives' });

    if (result?.kind === 'system_message' && result.message) {
      // Wrap the pre-formatted directive message in a <gv> tag
      const gvPayload = JSON.stringify({
        action: 'directive',
        message: result.message,
      });
      const systemMessage = `<gv>${gvPayload}</gv>`;
      respond(allowTool('PreToolUse', systemMessage));
      return;
    }

    // No directives pending — allow the tool call
    respond(allowTool('PreToolUse'));
  } catch (error: unknown) {
    logError('DirectiveDelivery main', error);
    // Never block the tool call due to a directive delivery error
    respond(allowTool('PreToolUse'));
  }
}

// Only run when not in a test environment
if (!isTestEnvironment()) {
  runDirectiveDeliveryHook().catch((error: unknown) => {
    logError('DirectiveDelivery uncaught', error);
    respond(allowTool('PreToolUse'));
  });
}
