/** `export`, export session data as JSON/CSV/markdown. */
import type { ToolModule } from './types.js';

export const exportTool: ToolModule = {
  name: 'export',
  engineTool: 'analytics_export',
  description:
    'Export session data in JSON, CSV, or markdown format. Supports the current session, a specific ' +
    'historical session, all historical data, or all projects (scope="all_projects"). Filter by tags.',
  inputSchema: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['json', 'csv', 'markdown'] },
      scope: {
        type: 'string',
        description: '"current", "historical", "all_projects", or "session:<id>" (default: current).',
      },
      sections: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'timeline'],
        },
      },
      output_path: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['format'],
  },
};
