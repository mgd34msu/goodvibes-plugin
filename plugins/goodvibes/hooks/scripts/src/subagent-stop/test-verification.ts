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

import { findTestsForFile, runTests } from '../automation/test-runner.js';

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

/** Runs tests for files modified by an agent */
export async function verifyAgentTests(
  cwd: string,
  filesModified: string[],
  state: HooksState
): Promise<TestVerificationResult> {
  // Find tests for modified files
  const testsToRun: string[] = [];
  for (const file of filesModified) {
    const tests = findTestsForFile(file);
    testsToRun.push(...tests);
  }

  // Deduplicate
  const uniqueTests = [...new Set(testsToRun)];

  if (uniqueTests.length === 0) {
    return { ran: false, passed: true, summary: 'No tests for modified files' };
  }

  const result = await runTests(uniqueTests, cwd);

  // Update state
  if (result.passed) {
    state.tests.passingFiles.push(
      ...uniqueTests.filter((t) => !state.tests.passingFiles.includes(t))
    );
  } else {
    for (const failure of result.failures) {
      if (!state.tests.failingFiles.includes(failure.testFile)) {
        state.tests.failingFiles.push(failure.testFile);
      }
      state.tests.pendingFixes.push({
        testFile: failure.testFile,
        error: failure.error,
        fixAttempts: 0,
      });
    }
  }

  return {
    ran: true,
    passed: result.passed,
    summary: result.summary,
  };
}
