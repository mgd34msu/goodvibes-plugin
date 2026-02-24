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
  allowTool,
  isTestEnvironment,
} from '../shared/index.js';
import { RuntimeClient } from '../shared/runtime-client.js';
import { stdin } from 'node:process';

/**
 * Drain stdin without validation — this hook doesn't use the input
 * but must consume it to avoid broken pipe errors.
 */
async function drainStdin(): Promise<void> {
  for await (const _chunk of stdin) { /* discard */ }
}

/**
 * Main entry point for the directive-delivery hook.
 */
export async function runDirectiveDeliveryHook(): Promise<void> {
  try {
    // Drain stdin (required to avoid broken pipe, but we don't need the data)
    await drainStdin();

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
