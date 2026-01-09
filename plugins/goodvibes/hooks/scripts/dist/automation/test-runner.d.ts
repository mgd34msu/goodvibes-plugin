/**
 * Test Runner
 *
 * Executes test suites and parses test runner output to extract
 * failure information for automated debugging.
 */
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
 * Finds test files corresponding to a source file using common naming patterns.
 * Checks for .test.ts, .test.tsx, .spec.ts, .spec.tsx variations and
 * common test directory structures like __tests__ and tests/.
 *
 * @param sourceFile - The path to the source file to find tests for
 * @returns An array of existing test file paths that match the source file
 *
 * @example
 * const tests = findTestsForFile('src/utils/helper.ts');
 * // May return ['src/utils/helper.test.ts', 'src/__tests__/utils/helper.test.ts']
 */
export declare function findTestsForFile(sourceFile: string): string[];
/**
 * Runs tests for specific test files and returns structured results.
 * Uses npm test with file arguments. Returns early if no files provided.
 *
 * @param testFiles - Array of test file paths to run
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a TestResult object with pass/fail status, summary, and parsed failures
 *
 * @example
 * const result = await runTests(['src/utils/helper.test.ts'], '/my-project');
 * if (!result.passed) {
 *   result.failures.forEach(f => console.error(`${f.testFile}: ${f.error}`));
 * }
 */
export declare function runTests(testFiles: string[], cwd: string): Promise<TestResult>;
/**
 * Runs the full test suite using npm test.
 * Returns structured results with parsed failure information.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to a TestResult object with pass/fail status, summary, and parsed failures
 *
 * @example
 * const result = await runFullTestSuite('/my-project');
 * console.log(result.summary); // 'All tests passed' or 'Tests failed'
 */
export declare function runFullTestSuite(cwd: string): Promise<TestResult>;
