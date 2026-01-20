/**
 * Batch tool schemas - bulk operations for multiple files
 */

export const BATCH_SCHEMAS = [
  {
    name: 'batch_read',
    description: 'Read multiple files in a single call with per-file precision reading. Each file can specify exact line ranges (offset/limit) for efficient partial reads. Returns file contents, total line counts, sizes, and range metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            oneOf: [
              {
                type: 'string',
                description: 'Simple file path - reads entire file (or first 50 lines in standard mode)',
              },
              {
                type: 'object',
                description: 'Detailed file read request with optional line range',
                properties: {
                  path: {
                    type: 'string',
                    description: 'File path (relative to project root or absolute)',
                  },
                  offset: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Start line (1-based). Omit to start from line 1',
                  },
                  limit: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Maximum lines to read. Omit to read to end',
                  },
                },
                required: ['path'],
              },
            ],
          },
          description: 'Mixed array: simple paths (strings) OR detailed specs with offset/limit (objects). Examples: ["file.ts"] or [{"path": "file.ts", "offset": 100, "limit": 50}]',
        },
        output_mode: {
          type: 'string',
          enum: ['minimal', 'standard', 'verbose'],
          description: 'Output verbosity: minimal (metadata only, no content), standard (first 50 lines default, respects explicit ranges), verbose (full file or exact range specified)',
          default: 'standard',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'smart_glob',
    description: 'Glob with intelligent filtering and output control. Supports multiple patterns, exclusions, and various output modes. Automatically ignores node_modules, .git, and other common directories.',
    inputSchema: {
      type: 'object',
      properties: {
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of glob patterns to match (e.g., ["**/*.ts", "**/*.tsx"])',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Patterns to exclude (e.g., ["**/*.test.ts", "**/__tests__/**"])',
        },
        output_mode: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard'],
          description: 'Output verbosity: count_only (just "X files match"), minimal (file paths only), standard (paths + sizes + mod times, default)',
          default: 'standard',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of files to return (default: 100, max: 1000)',
          default: 100,
        },
      },
      required: ['patterns'],
    },
  },
  {
    name: 'grep_with_content',
    description: 'Search for a regex pattern across files with configurable context output. More powerful than basic grep - supports various output modes, file filtering, and context lines around matches.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific paths to search in (if not provided, searches all files)',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "**/*.ts")',
        },
        output_mode: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          description: 'Output verbosity: count_only ("X matches in Y files"), minimal (file:line pairs only), standard (+ 1 line context, default), verbose (+ 3 lines context)',
          default: 'standard',
        },
        max_matches: {
          type: 'integer',
          description: 'Maximum number of matches to return (default: 100, max: 500)',
          default: 100,
        },
        case_insensitive: {
          type: 'boolean',
          description: 'Case insensitive search (default: false)',
          default: false,
        },
      },
      required: ['pattern'],
    },
  },
];
