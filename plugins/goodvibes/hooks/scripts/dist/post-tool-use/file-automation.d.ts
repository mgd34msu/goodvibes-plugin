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
 */
export declare function handleFileModification(state: HooksState, input: HookInput, toolName: string): {
    tracked: boolean;
    filePath: string | null;
};
/**
 * Process automation for file-modifying tools (Edit, Write).
 */
export declare function processFileAutomation(state: HooksState, config: GoodVibesConfig, input: HookInput, toolName: string): Promise<AutomationMessages>;
