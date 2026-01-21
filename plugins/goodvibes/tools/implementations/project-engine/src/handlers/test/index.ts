/**
 * Test handlers
 *
 * Provides test discovery and analysis tools:
 * - find_tests_for_file: Find test files that cover a given source file
 * - get_test_coverage: Parse coverage reports and map to functions
 * - suggest_test_cases: Analyze function and suggest edge cases to test
 *
 * @module handlers/test
 */

// Find Tests for File
export { handleFindTestsForFile } from './find-tests.js';
export type { FindTestsForFileArgs, TestType } from './find-tests.js';

// Get Test Coverage
export { handleGetTestCoverage } from './coverage.js';
export type { GetTestCoverageArgs } from './coverage.js';

// Suggest Test Cases
export { handleSuggestTestCases } from './suggest-cases.js';
export type { SuggestTestCasesArgs } from './suggest-cases.js';
