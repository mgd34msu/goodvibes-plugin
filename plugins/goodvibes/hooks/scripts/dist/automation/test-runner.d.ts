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
 * Finds test files corresponding to a source file using common patterns.
 */
export declare function findTestsForFile(sourceFile: string): string[];
/**
 * Run tests for specific files
 */
export declare function runTests(testFiles: string[], cwd: string): TestResult;
/**
 * Run the full test suite
 */
export declare function runFullTestSuite(cwd: string): TestResult;
