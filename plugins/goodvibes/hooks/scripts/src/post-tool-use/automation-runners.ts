/**
 * Automation Runners for Post-Tool-Use Hook
 *
 * Conditional runners for tests, builds, checkpoints, and branches.
 * Each function checks configuration before executing automation.
 */

import { debug, logError } from '../shared/index.js';
import type { HooksState } from '../types/state.js';
import type { GoodVibesConfig } from '../types/config.js';

// File tracking
import { getModifiedFileCount } from './file-tracker.js';

// Git operations
import { createCheckpointIfNeeded } from './checkpoint-manager.js';
import { maybeCreateFeatureBranch } from './git-branch-manager.js';

// Testing and building
import {
  findTestsForFile,
  runTests,
  type TestResult,
} from '../automation/test-runner.js';
import { runTypeCheck, type BuildResult } from '../automation/build-runner.js';

// State management
import { updateTestState, updateBuildState } from '../state.js';

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
export async function maybeRunTests(
  state: HooksState,
  config: GoodVibesConfig,
  filePath: string,
  cwd: string
): Promise<{ ran: boolean; result: TestResult | null; state: HooksState }> {
  if (
    !config.automation.enabled ||
    !config.automation.testing.runAfterFileChange
  ) {
    return { ran: false, result: null, state };
  }

  // Skip if file is a test file itself
  if (filePath.includes('.test.') || filePath.includes('.spec.')) {
    return { ran: false, result: null, state };
  }

  // Find tests for this file
  const testFiles = findTestsForFile(filePath);
  if (testFiles.length === 0) {
    debug(`No tests found for: ${filePath}`);
    return { ran: false, result: null, state };
  }

  debug(`Running tests for: ${filePath}`, { testFiles });

  try {
    const result = await runTests(testFiles, cwd);

    // Update state with test results
    if (result.passed) {
      state = updateTestState(state, {
        lastQuickRun: new Date().toISOString(),
        passingFiles: [...new Set([...state.tests.passingFiles, ...testFiles])],
        failingFiles: state.tests.failingFiles.filter(
          (f) => !testFiles.includes(f)
        ),
      });
    } else {
      state = updateTestState(state, {
        lastQuickRun: new Date().toISOString(),
        failingFiles: [...new Set([...state.tests.failingFiles, ...testFiles])],
        passingFiles: state.tests.passingFiles.filter(
          (f) => !testFiles.includes(f)
        ),
        pendingFixes: result.failures.map((f) => ({
          testFile: f.testFile,
          error: f.error,
          fixAttempts: 0,
        })),
      });
    }

    return { ran: true, result, state };
  } catch (error: unknown) {
    logError('maybeRunTests', error);
    return { ran: false, result: null, state };
  }
}

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
export async function maybeRunBuild(
  state: HooksState,
  config: GoodVibesConfig,
  cwd: string
): Promise<{ ran: boolean; result: BuildResult | null; state: HooksState }> {
  if (!config.automation.enabled) {
    return { ran: false, result: null, state };
  }

  const modifiedCount = getModifiedFileCount(state);
  const threshold = config.automation.building.runAfterFileThreshold;

  if (modifiedCount < threshold) {
    debug(
      `Build skipped: ${modifiedCount} files modified (threshold: ${threshold})`
    );
    return { ran: false, result: null, state };
  }

  debug(`Running typecheck after ${modifiedCount} file modifications`);

  try {
    const result = await runTypeCheck(cwd);

    // Update build state
    state = updateBuildState(state, {
      lastRun: new Date().toISOString(),
      status: result.passed ? 'passing' : 'failing',
      errors: result.errors,
      fixAttempts: result.passed ? 0 : state.build.fixAttempts + 1,
    });

    return { ran: true, result, state };
  } catch (error: unknown) {
    logError('maybeRunBuild', error);
    return { ran: false, result: null, state };
  }
}

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
export async function maybeCreateCheckpoint(
  state: HooksState,
  config: GoodVibesConfig,
  cwd: string
): Promise<{ created: boolean; message: string; state: HooksState }> {
  if (!config.automation.enabled || !config.automation.git.autoCheckpoint) {
    return { created: false, message: '', state };
  }

  return await createCheckpointIfNeeded(state, cwd);
}

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
export async function maybeCreateBranch(
  state: HooksState,
  config: GoodVibesConfig,
  cwd: string
): Promise<{ created: boolean; branchName: string | null }> {
  if (!config.automation.enabled || !config.automation.git.autoFeatureBranch) {
    return { created: false, branchName: null };
  }

  return await maybeCreateFeatureBranch(state, cwd);
}
