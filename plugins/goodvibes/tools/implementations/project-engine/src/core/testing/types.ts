/**
 * Testing Domain Types
 *
 * Shared types for the testing domain (test coverage, test finder).
 *
 * @module core/testing/types
 */

// =============================================================================
// Coverage Types
// =============================================================================

/**
 * Arguments for the get_test_coverage MCP tool.
 */
export interface TestCoverageArgs {
  /** Specific source file to check coverage for (if omitted, returns overall coverage) */
  file?: string;
  /** Path to coverage report directory or file (relative to PROJECT_ROOT) */
  coverage_path?: string;
  /** Alias for coverage_path (either can be used) */
  path?: string;
}

/**
 * Coverage percentages for different code coverage metrics.
 * All values are percentages from 0–100, rounded to one decimal place.
 */
export interface CoverageMetrics {
  /** Percentage of source lines executed */
  lines: number;
  /** Percentage of conditional branches taken */
  branches: number;
  /** Percentage of functions called */
  functions: number;
  /** Percentage of statements executed */
  statements: number;
}

/**
 * Uncovered lines grouped by source file.
 */
export interface UncoveredLines {
  /** Source file path relative to project root */
  file: string;
  /** Sorted array of 1-based line numbers that were not executed */
  lines: number[];
}

/**
 * A function that was never called during testing.
 */
export interface UncoveredFunction {
  /** Source file path relative to project root */
  file: string;
  /** Function name as declared in source code */
  name: string;
  /** 1-based line number where the function is defined */
  line: number;
}

/**
 * Supported coverage report format types.
 */
export type CoverageReportType = 'lcov' | 'istanbul' | 'c8' | 'vitest' | 'jest';

/**
 * Result of the get_test_coverage MCP tool.
 */
export interface CoverageResult {
  /** Coverage percentages for lines, branches, functions, and statements */
  coverage: CoverageMetrics;
  /** Files with their uncovered line numbers */
  uncovered_lines: UncoveredLines[];
  /** Functions that were never executed during tests */
  uncovered_functions: UncoveredFunction[];
  /** Relative path to the coverage report that was parsed */
  report_path: string;
  /** Format type of the coverage report that was detected and parsed */
  report_type: CoverageReportType;
}

/**
 * Parsed LCOV coverage data for a single file.
 * Internal representation used during parsing.
 */
export interface LcovFileCoverage {
  /** Absolute path to the source file */
  file: string;
  /** Map of line number to execution count (0 = uncovered) */
  lines: Map<number, number>;
  /** Map of function name to { line where defined, number of calls } */
  functions: Map<string, { line: number; hits: number }>;
  /** Map of line number to { branches taken, total branches } */
  branches: Map<number, { taken: number; total: number }>;
}

/**
 * Istanbul/NYC JSON coverage format for a single file.
 * Represents the raw JSON structure from coverage-final.json.
 */
export interface IstanbulFileCoverage {
  /** Absolute or relative path to source file */
  path: string;
  /** Map of statement ID to start/end line locations */
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  /** Map of function ID to name and location metadata */
  fnMap: Record<string, { name: string; decl: { start: { line: number } }; loc: { start: { line: number } } }>;
  /** Map of branch ID to location */
  branchMap: Record<string, { loc: { start: { line: number } } }>;
  /** Statement execution counts (key is statement ID) */
  s: Record<string, number>;
  /** Function call counts (key is function ID) */
  f: Record<string, number>;
  /** Branch execution counts (key is branch ID, value is array of counts per branch) */
  b: Record<string, number[]>;
}

// =============================================================================
// Find Tests Types
// =============================================================================

/**
 * Arguments for the find_tests_for_file MCP tool.
 */
export interface FindTestsArgs {
  /** Source file path (relative to project root or absolute) */
  file: string;
  /** Include tests that import files which import this file (transitive) */
  include_indirect?: boolean;
}

/**
 * Type of test based on file location and naming patterns.
 */
export type TestType = 'unit' | 'integration' | 'e2e';

/**
 * A single test file result with confidence scoring.
 */
export interface TestFile {
  /** Test file path relative to project root */
  file: string;
  /** Type of test based on file location and naming */
  type: TestType;
  /** Whether the test imports the source file directly */
  imports_source_directly: boolean;
  /** Confidence score (0–1) that this test covers the source file */
  confidence: number;
}

/**
 * Result of the find_tests_for_file MCP tool.
 */
export interface FindTestsResult {
  /** Array of test files found, sorted by confidence descending */
  tests: TestFile[];
  /** Total count of test files returned */
  count: number;
}
