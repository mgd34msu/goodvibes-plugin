/**
 * File Automation for Post-Tool-Use Hook
 *
 * Handles file modification tracking and orchestrates automation
 * for Edit and Write tools.
 */
import { HookInput } from '../shared.js';
import type { HooksState } from '../types/state.js';
import type { GoodVibesConfig } from '../types/config.js';
import type { AutomationMessages } from './response.js';
export { maybeRunTests, maybeRunBuild, maybeCreateCheckpoint, maybeCreateBranch, } from './automation-runners.js';
/**
 * Handle file modification tracking for Edit and Write tools.
 * Extracts file_path from tool input and records the modification in session state.
 * Distinguishes between file creation (Write) and modification (Edit).
 *
 * @param state - The current hooks session state to update with file tracking
 * @param input - The hook input containing tool_input with file_path
 * @param toolName - The name of the tool ('Edit' or 'Write')
 * @returns Object with `tracked` boolean and `filePath` string or null if no path found
 *
 * @example
 * const { tracked, filePath } = handleFileModification(state, input, 'Edit');
 * if (tracked) {
 *   console.log('Tracked modification to:', filePath);
 * }
 */
export declare function handleFileModification(state: HooksState, input: HookInput, toolName: string): {
    tracked: boolean;
    filePath: string | null;
};
/**
 * Process automation for file-modifying tools (Edit, Write).
 * Orchestrates the full automation pipeline: tracks file modification,
 * runs tests, checks build, creates checkpoints, and manages feature branches.
 *
 * @param state - The current hooks session state to track modifications and results
 * @param config - GoodVibes configuration with automation settings
 * @param input - The hook input containing tool_input with file_path and cwd
 * @param toolName - The name of the tool ('Edit' or 'Write')
 * @returns AutomationMessages object with array of messages from automation results
 *
 * @example
 * const { messages } = await processFileAutomation(state, config, input, 'Edit');
 * if (messages.length > 0) {
 *   console.log('Automation results:', messages.join(', '));
 * }
 */
export declare function processFileAutomation(state: HooksState, config: GoodVibesConfig, input: HookInput, toolName: string): Promise<AutomationMessages>;
