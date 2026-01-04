/**
 * Automation Runners for Post-Tool-Use Hook
 *
 * Conditional runners for tests, builds, checkpoints, and branches.
 * Each function checks configuration before executing automation.
 */
import { debug, logError } from '../shared.js';
// File tracking
import { getModifiedFileCount } from './file-tracker.js';
// Git operations
import { createCheckpointIfNeeded } from './checkpoint-manager.js';
import { maybeCreateFeatureBranch } from './git-branch-manager.js';
// Testing and building
import { findTestsForFile, runTests } from '../automation/test-runner.js';
import { runTypeCheck } from '../automation/build-runner.js';
// State management
import { updateTestState, updateBuildState } from '../state.js';
/**
 * Run tests for modified files if enabled.
 */
export async function maybeRunTests(state, config, filePath, cwd) {
    if (!config.automation.enabled || !config.automation.testing.runAfterFileChange) {
        return { ran: false, result: null };
    }
    // Skip if file is a test file itself
    if (filePath.includes('.test.') || filePath.includes('.spec.')) {
        return { ran: false, result: null };
    }
    // Find tests for this file
    const testFiles = findTestsForFile(filePath);
    if (testFiles.length === 0) {
        debug(`No tests found for: ${filePath}`);
        return { ran: false, result: null };
    }
    debug(`Running tests for: ${filePath}`, { testFiles });
    try {
        const result = await runTests(testFiles, cwd);
        // Update state with test results
        if (result.passed) {
            updateTestState(state, {
                lastQuickRun: new Date().toISOString(),
                passingFiles: [...new Set([...state.tests.passingFiles, ...testFiles])],
                failingFiles: state.tests.failingFiles.filter((f) => !testFiles.includes(f)),
            });
        }
        else {
            updateTestState(state, {
                lastQuickRun: new Date().toISOString(),
                failingFiles: [...new Set([...state.tests.failingFiles, ...testFiles])],
                passingFiles: state.tests.passingFiles.filter((f) => !testFiles.includes(f)),
                pendingFixes: result.failures.map((f) => ({
                    testFile: f.testFile,
                    error: f.error,
                    fixAttempts: 0,
                })),
            });
        }
        return { ran: true, result };
    }
    catch (error) {
        logError('maybeRunTests', error);
        return { ran: false, result: null };
    }
}
/**
 * Run build/typecheck if threshold reached.
 */
export async function maybeRunBuild(state, config, cwd) {
    if (!config.automation.enabled) {
        return { ran: false, result: null };
    }
    const modifiedCount = getModifiedFileCount(state);
    const threshold = config.automation.building.runAfterFileThreshold;
    if (modifiedCount < threshold) {
        debug(`Build skipped: ${modifiedCount} files modified (threshold: ${threshold})`);
        return { ran: false, result: null };
    }
    debug(`Running typecheck after ${modifiedCount} file modifications`);
    try {
        const result = await runTypeCheck(cwd);
        // Update build state
        updateBuildState(state, {
            lastRun: new Date().toISOString(),
            status: result.passed ? 'passing' : 'failing',
            errors: result.errors,
            fixAttempts: result.passed ? 0 : state.build.fixAttempts + 1,
        });
        return { ran: true, result };
    }
    catch (error) {
        logError('maybeRunBuild', error);
        return { ran: false, result: null };
    }
}
/**
 * Check if checkpoint should be created and create it.
 */
export async function maybeCreateCheckpoint(state, config, cwd) {
    if (!config.automation.enabled || !config.automation.git.autoCheckpoint) {
        return { created: false, message: '' };
    }
    return await createCheckpointIfNeeded(state, cwd);
}
/**
 * Check if feature branch should be created.
 */
export async function maybeCreateBranch(state, config, cwd) {
    if (!config.automation.enabled || !config.automation.git.autoFeatureBranch) {
        return { created: false, branchName: null };
    }
    return await maybeCreateFeatureBranch(state, cwd);
}
