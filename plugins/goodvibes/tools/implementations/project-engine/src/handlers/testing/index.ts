/**
 * Testing domain handlers.
 *
 * Provides 2 tools for test analysis:
 * - project_test_coverage: Analyze test coverage reports and identify untested code
 * - project_test_find: Find test files associated with source files
 */

export { handleGetTestCoverage } from './coverage.js';
export { handleFindTestsForFile } from './find-tests.js';
