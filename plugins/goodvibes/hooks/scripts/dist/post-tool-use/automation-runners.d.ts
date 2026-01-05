/**
 * Automation Runners for Post-Tool-Use Hook
 *
 * Conditional runners for tests, builds, checkpoints, and branches.
 * Each function checks configuration before executing automation.
 */
import type { HooksState } from '../types/state.js';
import type { GoodVibesConfig } from '../types/config.js';
import { type TestResult } from '../automation/test-runner.js';
import { type BuildResult } from '../automation/build-runner.js';
/**
 * Run tests for modified files if test automation is enabled in config.
 * Skips test files themselves and files with no associated tests.
 * Returns updated state with test results on completion.
 *
 * @param state - The current hooks session state to update with results
 * @param config - GoodVibes configuration containing automation settings
 * @param filePath - Absolute path to the modified file to find tests for
 * @param cwd - Current working directory for running tests
 * @returns Object with `ran` boolean, `result` containing test output or null, and `state` with updated test results
 *
 * @example
 * const { ran, result, state: newState } = await maybeRunTests(state, config, '/src/utils.ts', '/project');
 * if (ran && result && !result.passed) {
 *   console.log('Tests failed:', result.summary);
 * }
 */
export declare function maybeRunTests(state: HooksState, config: GoodVibesConfig, filePath: string, cwd: string): Promise<{
    ran: boolean;
    result: TestResult | null;
    state: HooksState;
}>;
/**
 * Run TypeScript type checking if the file modification threshold is reached.
 * Tracks the number of modified files since last build and triggers when threshold exceeded.
 * Returns updated state with build status and any errors found.
 *
 * @param state - The current hooks session state containing modification counts
 * @param config - GoodVibes configuration with automation.building.runAfterFileThreshold
 * @param cwd - Current working directory for running the type checker
 * @returns Object with `ran` boolean, `result` containing build output or null, and `state` with updated build results
 *
 * @example
 * const { ran, result, state: newState } = await maybeRunBuild(state, config, '/project');
 * if (ran && result && !result.passed) {
 *   console.log('Build errors:', result.errors);
 * }
 */
export declare function maybeRunBuild(state: HooksState, config: GoodVibesConfig, cwd: string): Promise<{
    ran: boolean;
    result: BuildResult | null;
    state: HooksState;
}>;
/**
 * Check if a git checkpoint should be created and create it if conditions are met.
 * Creates automatic checkpoints based on file modification count thresholds.
 * Only creates checkpoint if autoCheckpoint is enabled in config.
 *
 * @param state - The current hooks session state with file tracking data
 * @param config - GoodVibes configuration with automation.git.autoCheckpoint setting
 * @param cwd - Current working directory (git repository root)
 * @returns Object with `created` boolean, `message` describing the checkpoint or empty string, and updated state
 *
 * @example
 * const { created, message, state: newState } = await maybeCreateCheckpoint(state, config, '/project');
 * if (created) {
 *   console.log('Checkpoint created:', message);
 * }
 */
export declare function maybeCreateCheckpoint(state: HooksState, config: GoodVibesConfig, cwd: string): Promise<{
    created: boolean;
    message: string;
    state: HooksState;
}>;
/**
 * Check if a feature branch should be created and create it if conditions are met.
 * Creates a feature branch when significant file creation is detected on main branch.
 * Only creates branch if autoFeatureBranch is enabled in config.
 *
 * @param state - The current hooks session state with git and file tracking data
 * @param config - GoodVibes configuration with automation.git.autoFeatureBranch setting
 * @param cwd - Current working directory (git repository root)
 * @returns Object with `created` boolean and `branchName` string or null if not created
 *
 * @example
 * const { created, branchName } = await maybeCreateBranch(state, config, '/project');
 * if (created) {
 *   console.log('Created branch:', branchName);
 * }
 */
export declare function maybeCreateBranch(state: HooksState, config: GoodVibesConfig, cwd: string): Promise<{
    created: boolean;
    branchName: string | null;
}>;
