/**
 * Test Runner
 *
 * Executes test suites and parses test runner output to extract
 * failure information for automated debugging.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { extractErrorOutput } from '../shared.js';

/** Number of lines to include after a test failure match for context. */
const FAILURE_CONTEXT_LINES = 5;

/** Result of a test run operation. */
export interface TestResult {
  passed: boolean;
  summary: string;
  failures: {
    testFile: string;
    testName: string;
    error: string;
  }[];
}

/**
 * Finds test files corresponding to a source file using common patterns.
 */
export function findTestsForFile(sourceFile: string): string[] {
  const testPatterns = [
    sourceFile.replace(/\.tsx?$/, '.test.ts'),
    sourceFile.replace(/\.tsx?$/, '.test.tsx'),
    sourceFile.replace(/\.tsx?$/, '.spec.ts'),
    sourceFile.replace(/\.tsx?$/, '.spec.tsx'),
    sourceFile.replace(/src\/(.*)\.tsx?$/, 'src/__tests__/$1.test.ts'),
    sourceFile.replace(/src\/(.*)\.tsx?$/, 'tests/$1.test.ts'),
  ];

  return testPatterns.filter(p => fs.existsSync(p));
}

/**
 * Run tests for specific files
 */
export function runTests(testFiles: string[], cwd: string): TestResult {
  if (testFiles.length === 0) {
    return { passed: true, summary: 'No tests to run', failures: [] };
  }

  try {
    const fileArgs = testFiles.join(' ');
    execSync(`npm test -- ${fileArgs}`, { cwd, stdio: 'pipe', timeout: 300000 });
    return { passed: true, summary: `${testFiles.length} test files passed`, failures: [] };
  } catch (error: unknown) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: 'Tests failed',
      failures: parseTestFailures(output),
    };
  }
}

/**
 * Run the full test suite
 */
export function runFullTestSuite(cwd: string): TestResult {
  try {
    execSync('npm test', { cwd, stdio: 'pipe' });
    return { passed: true, summary: 'All tests passed', failures: [] };
  } catch (error: unknown) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: 'Tests failed',
      failures: parseTestFailures(output),
    };
  }
}

/**
 * Parses test runner output to extract failure information.
 */
function parseTestFailures(output: string): TestResult['failures'] {
  const failures: TestResult['failures'] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match common test failure patterns
    const failMatch = line.match(/FAIL\s+(.+\.test\.[tj]sx?)/);
    if (failMatch) {
      failures.push({
        testFile: failMatch[1],
        testName: 'unknown',
        error: lines.slice(i, i + FAILURE_CONTEXT_LINES).join('\n'),
      });
    }
  }

  return failures;
}
