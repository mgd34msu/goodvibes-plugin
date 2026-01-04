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
 * Run tests for modified files if enabled.
 */
export declare function maybeRunTests(state: HooksState, config: GoodVibesConfig, filePath: string, cwd: string): Promise<{
    ran: boolean;
    result: TestResult | null;
}>;
/**
 * Run build/typecheck if threshold reached.
 */
export declare function maybeRunBuild(state: HooksState, config: GoodVibesConfig, cwd: string): Promise<{
    ran: boolean;
    result: BuildResult | null;
}>;
/**
 * Check if checkpoint should be created and create it.
 */
export declare function maybeCreateCheckpoint(state: HooksState, config: GoodVibesConfig, cwd: string): Promise<{
    created: boolean;
    message: string;
}>;
/**
 * Check if feature branch should be created.
 */
export declare function maybeCreateBranch(state: HooksState, config: GoodVibesConfig, cwd: string): Promise<{
    created: boolean;
    branchName: string | null;
}>;
