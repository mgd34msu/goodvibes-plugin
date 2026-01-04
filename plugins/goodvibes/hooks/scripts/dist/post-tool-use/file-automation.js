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
