/**
 * Smoke test handlers
 *
 * Provides the run_smoke_test MCP tool for running quick validation
 * checks on a project including type checking, linting, and building.
 *
 * @module handlers/smoke-test
 */

import { ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';
import { safeExec, detectPackageManager } from '../utils.js';

/**
 * Arguments for the run_smoke_test MCP tool
 */
export interface RunSmokeTestArgs {
  /** Test type: 'all', 'typecheck', 'lint', or 'build' (default: 'all') */
  type?: string;
  /** Specific files to test (not yet implemented) */
  files?: string[];
  /** Timeout in seconds for each test (default: 30) */
  timeout?: number;
}

/**
 * Result of a single smoke test
 */
interface TestResult {
  /** Name of the test that was run */
  name: string;
  /** Whether the test passed */
  passed: boolean;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Test output (truncated to 500 chars) */
  output: string;
  /** Error message if the test failed, null otherwise */
  error: string | null;
}

/**
 * Handles the run_smoke_test MCP tool call.
 *
 * Runs quick validation checks to verify the project is in a good state:
 * - typecheck: Runs `tsc --noEmit` to check for TypeScript errors
 * - lint: Runs the project's lint script
 * - build: Runs the project's build script
 *
 * @param args - The run_smoke_test tool arguments
 * @param args.type - Test type: 'all', 'typecheck', 'lint', 'build' (default: 'all')
 * @param args.files - Specific files to test (not implemented)
 * @param args.timeout - Timeout per test in seconds (default: 30)
 * @returns MCP tool response with test results and summary
 *
 * @example
 * await handleRunSmokeTest({ type: 'all', timeout: 60 });
 * // Returns: {
 * //   passed: true,
 * //   tests: [{ name: 'typecheck', passed: true, duration_ms: 1234, ... }],
 * //   summary: { total: 3, passed: 3, failed: 0, duration_ms: 5000 }
 * // }
 *
 * @example
 * await handleRunSmokeTest({ type: 'typecheck' });
 * // Runs only TypeScript type checking
 */
export async function handleRunSmokeTest(args: RunSmokeTestArgs): Promise<ToolResponse> {
  const testType = args.type || 'all';
  const timeout = (args.timeout || 30) * 1000;
  const tests: TestResult[] = [];

  const pm = detectPackageManager(PROJECT_ROOT);
  const runCmd = pm === 'npm' ? 'npm run' : pm;

  // Type check
  if (testType === 'all' || testType === 'typecheck') {
    const start = Date.now();
    const result = await safeExec(`${runCmd} tsc --noEmit 2>&1 || echo "TypeScript not configured"`, PROJECT_ROOT, timeout);
    tests.push({
      name: 'typecheck',
      passed: !result.error && !result.stdout.includes('error'),
      duration_ms: Date.now() - start,
      output: result.stdout.slice(0, 500),
      error: result.error || null,
    });
  }

  // Lint
  if (testType === 'all' || testType === 'lint') {
    const start = Date.now();
    const result = await safeExec(`${runCmd} lint 2>&1 || echo "Lint not configured"`, PROJECT_ROOT, timeout);
    tests.push({
      name: 'lint',
      passed: !result.error && !result.stdout.includes('error'),
      duration_ms: Date.now() - start,
      output: result.stdout.slice(0, 500),
      error: result.error || null,
    });
  }

  // Build
  if (testType === 'all' || testType === 'build') {
    const start = Date.now();
    const result = await safeExec(`${runCmd} build 2>&1 || echo "Build not configured"`, PROJECT_ROOT, timeout);
    tests.push({
      name: 'build',
      passed: !result.error && !result.stdout.includes('error'),
      duration_ms: Date.now() - start,
      output: result.stdout.slice(0, 500),
      error: result.error || null,
    });
  }

  const passed = tests.filter(t => t.passed).length;
  const failed = tests.filter(t => !t.passed).length;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        passed: failed === 0,
        tests,
        summary: {
          total: tests.length,
          passed,
          failed,
          duration_ms: tests.reduce((sum, t) => sum + t.duration_ms, 0),
        },
      }, null, 2),
    }],
  };
}
