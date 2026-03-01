/**
 * Testing Domain Constants
 *
 * Coverage report locations and test file discovery patterns.
 *
 * @module core/testing/constants
 */

// =============================================================================
// Coverage Paths
// =============================================================================

/**
 * Common coverage report file locations relative to a search base directory.
 * Checked in order; the first file that exists and is recognized is used.
 */
export const COVERAGE_PATHS: string[] = [
  'coverage/lcov.info',
  'coverage/lcov-report/lcov.info',
  'coverage/coverage-final.json',
  'coverage/coverage-summary.json',
  '.nyc_output/coverage-final.json',
  'coverage.lcov',
  'lcov.info',
];

// =============================================================================
// Test Patterns
// =============================================================================

/**
 * Test file discovery patterns.
 * - `suffixes`: File name endings that identify test files
 * - `directories`: Directory names that indicate test files
 */
export const TEST_PATTERNS = {
  /** File name suffixes that mark a file as a test */
  suffixes: [
    '.test.ts',
    '.test.tsx',
    '.test.js',
    '.test.jsx',
    '.spec.ts',
    '.spec.tsx',
    '.spec.js',
    '.spec.jsx',
  ],
  /** Directory names whose contents are treated as test files */
  directories: ['__tests__', 'tests', 'test', 'e2e', 'integration'],
} as const;
