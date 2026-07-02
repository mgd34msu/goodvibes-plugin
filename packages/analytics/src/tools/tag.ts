/** `tag` — add/remove/list/auto-suggest session tags. */
import type { ToolModule } from './types.js';

export const tagTool: ToolModule = {
  name: 'tag',
  engineTool: 'analytics_tag',
  description:
    'Add, remove, or list tags on the current session. Tags are persisted in the global SQLite DB and ' +
    'support multi-tag arrays. Use action="auto" for heuristic tag suggestions from JSONL analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'remove', 'list', 'auto'] },
      value: { type: 'string', minLength: 1, maxLength: 100, description: 'Required for add/remove.' },
      scope: { type: 'string', enum: ['session', 'all'], description: 'For the list action (default: session).' },
    },
    required: ['action'],
  },
};
