/**
 * Smoke test handlers
 */

import { ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';
import { safeExec, detectPackageManager } from '../utils.js';

export interface RunSmokeTestArgs {
  type?: string;
  files?: string[];
  timeout?: number;
}

interface TestResult {
  name: string;
  passed: boolean;
  duration_ms: number;
  output: string;
  error: string | null;
}

/**
 * Handle run_smoke_test tool call
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
