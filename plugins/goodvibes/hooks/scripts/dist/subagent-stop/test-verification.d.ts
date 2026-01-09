/**
 * Test Verification
 *
 * Runs tests for files modified by an agent to verify correctness.
 * Finds relevant test files, executes them, and updates state with results.
 * Ensures agent changes don't break existing functionality.
 *
 * @module subagent-stop/test-verification
 * @see {@link ../automation/test-runner} for test execution
 */
import type { HooksState } from '../types/state.js';
/** Result of verifying tests for agent-modified files */
export interface TestVerificationResult {
    /** Whether tests were run */
    ran: boolean;
    /** Whether all tests passed */
    passed: boolean;
    /** Summary of test results */
    summary: string;
}
/**
 * Runs tests for files modified by an agent.
 * Finds related test files, executes them, and updates state with results.
 *
 * @param cwd - The current working directory (project root)
 * @param filesModified - Array of file paths that were modified
 * @param state - Current HooksState to update with test results
 * @returns Promise resolving to TestVerificationResult with pass/fail status
 *
 * @example
 * const result = await verifyAgentTests(cwd, ['src/api.ts'], state);
 * if (!result.passed) {
 *   console.log('Tests failed:', result.summary);
 * }
 */
export declare function verifyAgentTests(cwd: string, filesModified: string[], state: HooksState): Promise<TestVerificationResult>;
