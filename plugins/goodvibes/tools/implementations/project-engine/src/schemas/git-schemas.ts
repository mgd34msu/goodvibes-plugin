/**
 * Git tool schemas - PR creation, merge conflict resolution, rollback
 */

export const GIT_SCHEMAS = [
  {
    name: 'resolve_merge_conflict',
    description: 'Analyze and suggest resolutions for git merge conflicts. Parses conflict markers, analyzes both versions, and recommends resolution strategy (ours, theirs, or combined). Can auto-resolve simple conflicts.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Path to file with merge conflicts',
        },
        strategy: {
          type: 'string',
          enum: ['analyze', 'ours', 'theirs', 'auto'],
          description: 'Resolution strategy: analyze only, take ours, take theirs, or auto-resolve',
          default: 'analyze',
        },
        context_lines: {
          type: 'integer',
          description: 'Lines of context around conflicts (default: 3)',
          default: 3,
        },
      },
      required: ['file'],
    },
  },
];
