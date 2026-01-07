/**
 * Bash Tool Handler for Post-Tool-Use Hook
 *
 * Handles Bash tool results:
 * - Detect dev server commands
 * - Parse and record dev server errors
 */

import { debug, HookInput } from '../shared/index.js';
import type { HooksState } from '../types/state.js';

import {
  isDevServerCommand,
  registerDevServer,
  parseDevServerErrors,
  recordDevServerError,
} from './dev-server-monitor.js';

/**
 * Handle Bash tool results for dev server detection and error parsing.
 * Detects when a dev server command is executed (npm run dev, vite, etc.)
 * and registers it in state. Also parses command output for error messages.
 *
 * @param state - The current hooks session state to update with dev server info
 * @param input - The hook input containing tool_input with command and output
 * @returns Object with `isDevServer` boolean and `errors` array of extracted error messages
 *
 * @example
 * const { isDevServer, errors } = handleBashTool(state, input);
 * if (isDevServer) {
 *   console.log('Dev server started');
 * }
 * if (errors.length > 0) {
 *   console.log('Errors detected:', errors);
 * }
 */
export function handleBashTool(
  state: HooksState,
  input: HookInput
): { isDevServer: boolean; errors: string[] } {
  const toolInput = input.tool_input;
  const command = toolInput?.command as string | undefined;
  const output = toolInput?.output as string | undefined;

  if (!command) {
    return { isDevServer: false, errors: [] };
  }

  // Check if this is a dev server command
  if (isDevServerCommand(command)) {
    // Register the dev server (we don't have PID, use command as identifier)
    const pid = `bash_${Date.now()}`;
    registerDevServer(state, pid, command, 3000); // Default port
    debug(`Registered dev server: ${command}`);
    return { isDevServer: true, errors: [] };
  }

  // Check for errors in command output
  if (output) {
    const errors = parseDevServerErrors(output);
    if (errors.length > 0) {
      // Record errors for any running dev servers
      for (const pid of Object.keys(state.devServers)) {
        recordDevServerError(state, pid, errors.join('; '));
      }
      return { isDevServer: false, errors };
    }
  }

  return { isDevServer: false, errors: [] };
}
