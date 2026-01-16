/**
 * Build analysis tool schemas
 */

export const BUILD_SCHEMAS = [
  {
    name: 'analyze_bundle',
    description: 'Analyze bundle size, duplicates, and tree-shaking issues in build output. Scans dist/, .next/, or build/ directories for bundle files and reports total size, chunk breakdown, largest modules, duplicate dependencies, and optimization recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Build output directory (auto-detects dist/, .next/, build/ if not specified)' },
        format: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: 'Output format - summary shows top chunks, detailed shows all',
          default: 'summary',
        },
      },
    },
  },
];
