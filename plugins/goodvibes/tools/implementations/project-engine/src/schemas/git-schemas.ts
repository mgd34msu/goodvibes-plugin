/**
 * Git tool schemas - PR creation, merge conflict resolution, rollback
 */

export const GIT_SCHEMAS = [
  {
    name: 'create_pull_request',
    description: 'Create a GitHub pull request with auto-generated description using LLM analysis. Handles git state detection, branch pushing, and PR creation via gh CLI. Requires gh CLI to be installed and authenticated.',
    inputSchema: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: 'Base branch for the PR (default: auto-detect main or master)',
        },
        title: {
          type: 'string',
          description: 'PR title (auto-generate from commits/branch name if not provided)',
        },
        body: {
          type: 'string',
          description: 'PR body/description (auto-generate using LLM if not provided)',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (default: false)',
          default: false,
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add to the PR',
        },
        reviewers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reviewer usernames to request',
        },
        auto_description: {
          type: 'boolean',
          description: 'Use LLM for description generation (default: true)',
          default: true,
        },
      },
    },
  },
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
