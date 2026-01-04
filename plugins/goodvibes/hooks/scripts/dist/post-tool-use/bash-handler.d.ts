/**
 * Bash Tool Handler for Post-Tool-Use Hook
 *
 * Handles Bash tool results:
 * - Detect dev server commands
 * - Parse and record dev server errors
 */
import { HookInput } from '../shared.js';
import type { HooksState } from '../types/state.js';
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
export declare function handleBashTool(state: HooksState, input: HookInput): {
    isDevServer: boolean;
    errors: string[];
};
