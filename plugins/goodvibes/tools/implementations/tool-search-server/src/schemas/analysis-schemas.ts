/**
 * Analysis tool schemas - profiling, log analysis, tech debt identification
 */

export const ANALYSIS_SCHEMAS = [
  {
    name: 'profile_function',
    description: 'Profile a JavaScript/TypeScript function for performance. Measures execution time, memory usage, and call frequency. Returns timing statistics (min, max, avg, p95) and memory deltas.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File containing the function',
        },
        function_name: {
          type: 'string',
          description: 'Name of the function to profile',
        },
        iterations: {
          type: 'integer',
          description: 'Number of iterations to run (default: 100)',
          default: 100,
        },
        args: {
          type: 'array',
          description: 'Arguments to pass to the function',
        },
        warmup: {
          type: 'integer',
          description: 'Warmup iterations before measuring (default: 10)',
          default: 10,
        },
      },
      required: ['file', 'function_name'],
    },
  },
  {
    name: 'log_analyzer',
    description: 'Analyze log files for patterns, errors, and anomalies. Parses structured (JSON) and unstructured logs, identifies error spikes, correlates events, and provides timeline analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to log file or directory',
        },
        format: {
          type: 'string',
          enum: ['auto', 'json', 'text', 'apache', 'nginx'],
          description: 'Log format (default: auto-detect)',
          default: 'auto',
        },
        time_range: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' },
          },
          description: 'Time range to analyze (ISO 8601 format)',
        },
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom patterns to search for',
        },
        group_by: {
          type: 'string',
          enum: ['level', 'source', 'hour', 'message'],
          description: 'Group results by field',
        },
      },
      required: ['path'],
    },
  },
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
