import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const testingSchemas: Tool[] = [
  {
    name: 'project_test_coverage',
    description: 'Get test coverage report for the project by parsing LCOV, Istanbul, or c8 coverage files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'string',
          description: 'Specific source file to get coverage for.',
        },
        coverage_path: {
          type: 'string',
          description: 'Path to the coverage report file. Auto-detected if not specified.',
        },
        path: {
          type: 'string',
          description: 'Project root path. Defaults to current working directory.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_test_find',
    description: 'Find test files associated with a given source file, including indirect test relationships.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'string',
          description: 'Path to the source file to find tests for.',
        },
        include_indirect: {
          type: 'boolean',
          description: 'Include tests that indirectly import the source file. Defaults to false.',
        },
      },
      required: ['file'],
    },
  },
];
