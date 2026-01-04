/**
 * File Automation for Post-Tool-Use Hook
 *
 * Handles file modification tracking and orchestrates automation
 * for Edit and Write tools.
 */
import { debug } from '../shared.js';
// File tracking
import { trackFileModification, trackFileCreation } from './file-tracker.js';
// Automation runners
import { maybeRunTests, maybeRunBuild, maybeCreateCheckpoint, maybeCreateBranch, } from './automation-runners.js';
// Re-export automation runners for backward compatibility
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
export function handleFileModification(state, input, toolName) {
    const toolInput = input.tool_input;
    const filePath = toolInput?.file_path;
    if (!filePath) {
        return { tracked: false, filePath: null };
    }
    if (toolName === 'Write') {
        trackFileCreation(state, filePath);
        debug(`Tracked file creation: ${filePath}`);
    }
    else {
        trackFileModification(state, filePath);
        debug(`Tracked file modification: ${filePath}`);
    }
    return { tracked: true, filePath };
}
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
export async function processFileAutomation(state, config, input, toolName) {
    const messages = [];
    const cwd = input.cwd;
    // Track file modification
    const { tracked, filePath } = handleFileModification(state, input, toolName);
    if (!tracked || !filePath) {
        return { messages };
    }
    // Run tests for modified file
    const testResult = await maybeRunTests(state, config, filePath, cwd);
    if (testResult.ran && testResult.result) {
        if (!testResult.result.passed) {
            messages.push(`Tests failed: ${testResult.result.summary}`);
        }
    }
    // Check if build should run
    const buildResult = await maybeRunBuild(state, config, cwd);
    if (buildResult.ran && buildResult.result) {
        if (!buildResult.result.passed) {
            messages.push(`Build check: ${buildResult.result.summary}`);
        }
    }
    // Check if checkpoint should be created
    const checkpoint = await maybeCreateCheckpoint(state, config, cwd);
    if (checkpoint.created) {
        messages.push(checkpoint.message);
    }
    // Check if feature branch should be created
    const branch = await maybeCreateBranch(state, config, cwd);
    if (branch.created && branch.branchName) {
        messages.push(`Created feature branch: ${branch.branchName}`);
    }
    return { messages };
}
