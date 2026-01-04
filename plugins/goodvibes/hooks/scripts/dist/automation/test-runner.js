import * as fs from 'fs';
import { execSync } from 'child_process';
/** Number of lines to include after a test failure match for context. */
const FAILURE_CONTEXT_LINES = 5;
/**
 * Finds test files corresponding to a source file using common patterns.
 */
export function findTestsForFile(sourceFile) {
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
export function runTests(testFiles, cwd) {
    if (testFiles.length === 0) {
        return { passed: true, summary: 'No tests to run', failures: [] };
    }
    try {
        const fileArgs = testFiles.join(' ');
        execSync(`npm test -- ${fileArgs}`, { cwd, stdio: 'pipe' });
        return { passed: true, summary: `${testFiles.length} test files passed`, failures: [] };
    }
    catch (error) {
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
export function runFullTestSuite(cwd) {
    try {
        execSync('npm test', { cwd, stdio: 'pipe' });
        return { passed: true, summary: 'All tests passed', failures: [] };
    }
    catch (error) {
        const output = extractErrorOutput(error);
        return {
            passed: false,
            summary: 'Tests failed',
            failures: parseTestFailures(output),
        };
    }
}
/**
 * Extract error output from an exec error
 */
function extractErrorOutput(error) {
    if (error && typeof error === 'object') {
        const execError = error;
        return execError.stdout?.toString() || execError.stderr?.toString() || execError.message || 'Unknown error';
    }
    return String(error);
}
/**
 * Parses test runner output to extract failure information.
 */
function parseTestFailures(output) {
    const failures = [];
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
