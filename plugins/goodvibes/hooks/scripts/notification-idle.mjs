#!/usr/bin/env node
/**
 * Notification Idle Hook - Standalone ESM Version
 *
 * Self-contained hook that handles idle_prompt notifications.
 * No external dependencies, no build step required.
 *
 * Usage in hooks.json:
 * {
 *   "matcher": "idle_prompt",
 *   "hooks": [{
 *     "type": "command",
 *     "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/notification-idle.mjs\""
 *   }]
 * }
 */

const IDLE_PROMPT_MESSAGE =
  'CRITICAL: IF YOU ARE WORKING ON A LONG TASK CHECK IF AGENTS HAVE FINISHED, CHECK ANY WORK COMPLETED, COMMIT VERIFIED WORK, CONTINUE WRFC LOOP. GO!';

/**
 * Read all input from stdin
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

/**
 * Main hook execution
 */
async function main() {
  try {
    // Read and parse input
    const rawInput = await readStdin();
    const input = JSON.parse(rawInput);

    // Log to stderr for debugging (won't affect hook output)
    console.error(`[notification-idle] Received: ${input.hook_event_name}, type: ${input.notification_type || 'unknown'}`);

    // Create response with system message
    const response = {
      continue: true,
      systemMessage: IDLE_PROMPT_MESSAGE
    };

    // Output response to stdout
    console.log(JSON.stringify(response));
    process.exit(0);

  } catch (error) {
    console.error(`[notification-idle] Error: ${error.message}`);

    // Still return a valid response on error
    const errorResponse = {
      continue: true,
      systemMessage: `Notification idle error: ${error.message}`
    };

    console.log(JSON.stringify(errorResponse));
    process.exit(0);
  }
}

// Run immediately
main();
