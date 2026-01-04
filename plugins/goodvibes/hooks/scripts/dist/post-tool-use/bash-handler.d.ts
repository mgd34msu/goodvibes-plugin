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
 * Handle Bash tool for dev server detection and error parsing.
 */
export declare function handleBashTool(state: HooksState, input: HookInput): {
    isDevServer: boolean;
    errors: string[];
};
