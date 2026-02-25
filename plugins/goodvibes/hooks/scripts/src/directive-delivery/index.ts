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

import {
  respond,
  allowTool,
  isTestEnvironment,
  buildGvDirectiveTag,
} from '../shared/index.js';
import { RuntimeClient } from '../shared/runtime-client.js';
import { stdin } from 'node:process';

/**
 * Main entry point for the directive-delivery hook.
 */
export async function runDirectiveDeliveryHook(): Promise<void> {
  try {
    // Put stdin into flowing mode to discard data without blocking
    stdin.resume();

    const runtimeClient = new RuntimeClient();

    // Fast path: runtime not available — no IPC overhead
    if (!runtimeClient.isAvailable()) {
      respond(allowTool('PreToolUse'));
      return;
    }

    // Query runtime for pending directives
    const result = await runtimeClient.query({ kind: 'get_directives' });

    if (result?.kind === 'system_message' && result.message) {
      // Wrap the pre-formatted directive message in a <gv> tag and inject via additionalContext
      const additionalContext = buildGvDirectiveTag(result.message);
      respond(allowTool('PreToolUse', additionalContext));
      return;
    }

    // No directives pending — allow the tool call
    respond(allowTool('PreToolUse'));
  } catch {
    // Silently allow — never block a tool call or write to stderr
    respond(allowTool('PreToolUse'));
  }
}

// Only run when not in a test environment
if (!isTestEnvironment()) {
  runDirectiveDeliveryHook().catch(() => {
    respond(allowTool('PreToolUse'));
  });
}
