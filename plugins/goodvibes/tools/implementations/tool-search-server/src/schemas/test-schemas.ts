/**
 * Test tool schemas - test discovery, coverage, suggestions
 */

export const TEST_SCHEMAS = [
  {
    name: 'find_tests_for_file',
    description: 'Find test files that cover a given source file. Analyzes test file naming patterns and import graphs to find related tests. Returns a ranked list of test files with confidence scores.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Source file path (relative to project root or absolute)' },
        include_indirect: { type: 'boolean', description: 'Include tests that import files which import this file', default: false },
      },
      required: ['file'],
    },
  },
  {
    name: 'get_test_coverage',
    description: 'Parse test coverage reports and map coverage data to functions. Finds coverage files (lcov.info, coverage-final.json, etc.) and extracts line, branch, function, and statement coverage percentages. Returns uncovered lines and functions for targeted test writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific source file to check coverage for (relative to project root)' },
        path: { type: 'string', description: 'Path to project or coverage directory (defaults to PROJECT_ROOT)' },
        coverage_path: { type: 'string', description: 'Alias for path - path to coverage report directory or file' },
      },
    },
  },
  {
    name: 'suggest_test_cases',
    description: 'Analyze a function and suggest comprehensive test cases. Uses LLM-powered analysis to identify edge cases, error conditions, boundary values, and happy path scenarios. Finds existing tests for context and suggests new test cases with rationale.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Source file containing the function (relative to project root or absolute)' },
        function: { type: 'string', description: 'Name of the function to analyze' },
        include_existing: { type: 'boolean', description: 'Include existing tests for context (default true)', default: true },
      },
      required: ['file', 'function'],
    },
  },
];
