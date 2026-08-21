/** `sync`, ingest Claude JSONL session files into the global analytics DB. */
import type { ToolModule } from './types.js';

export const syncTool: ToolModule = {
  name: 'sync',
  engineTool: 'analytics_sync',
  description:
    'Sync Claude JSONL session files into the global analytics SQLite database. Use scope="current" for ' +
    'the current project or scope="all" for every project under ~/.claude/projects/. Incremental via ' +
    'byte-offset tracking.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['current', 'all'], description: 'Sync scope (default: current).' },
    },
  },
};
