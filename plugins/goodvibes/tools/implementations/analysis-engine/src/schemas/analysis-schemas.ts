/**
 * Analysis tool schemas - profiling, log analysis, tech debt identification
 */

export const ANALYSIS_SCHEMAS = [
  {
    name: 'identify_tech_debt',
    description: 'Identify and grade technical debt in the codebase. Scans for TODO/FIXME/HACK comments, complex functions (high cyclomatic complexity), long files, missing tests, outdated dependencies, and code smells. Returns prioritized debt items with effort estimates.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to scan (default: project root)',
        },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['comments', 'complexity', 'coverage', 'dependencies', 'duplication', 'security'] },
          description: 'Categories to check (default: all)',
        },
        threshold: {
          type: 'object',
          properties: {
            complexity: { type: 'integer' },
            file_lines: { type: 'integer' },
            function_lines: { type: 'integer' },
          },
          description: 'Thresholds for flagging issues',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to exclude',
        },
      },
    },
  },
];
