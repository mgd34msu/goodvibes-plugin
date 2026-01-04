import { findTestsForFile, runTests } from '../automation/test-runner.js';
/** Runs tests for files modified by an agent */
export async function verifyAgentTests(cwd, filesModified, state) {
    // Find tests for modified files
    const testsToRun = [];
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
        state.tests.passingFiles.push(...uniqueTests.filter(t => !state.tests.passingFiles.includes(t)));
    }
    else {
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
