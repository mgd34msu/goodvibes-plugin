/**
 * Git tool schemas - PR creation, merge conflict resolution, rollback
 */

export const GIT_SCHEMAS = [
  {
    name: 'create_pull_request',
    description: 'Create a GitHub pull request with auto-generated descriptions. Analyzes git changes, generates title and description using LLM, pushes branch if needed, and creates PR via gh CLI. Supports draft PRs, labels, and reviewer assignment.',
    inputSchema: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: 'Base branch for the PR (default: auto-detect, usually "main")',
        },
        title: {
          type: 'string',
          description: 'PR title (auto-generated from branch name or commits if not provided)',
        },
        body: {
          type: 'string',
          description: 'PR body/description (auto-generated using LLM if not provided)',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (default: false)',
          default: false,
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add to the PR (e.g., ["bug", "enhancement"])',
        },
        reviewers: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub usernames to request as reviewers',
        },
        auto_description: {
          type: 'boolean',
          description: 'Use LLM to generate PR description (default: true)',
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
  {
    name: 'auto_rollback',
    description: 'Automatically rollback changes when conditions are met. Monitors for triggers (build failure, test failure, error patterns) and reverts to last known good state using git.',
    inputSchema: {
      type: 'object',
      properties: {
        trigger: {
          type: 'string',
          enum: ['build_fail', 'test_fail', 'error_pattern', 'manual'],
          description: 'Condition that triggers rollback',
        },
        scope: {
          type: 'string',
          enum: ['file', 'commit', 'branch'],
          description: 'Rollback scope: single file, last commit, or entire branch',
          default: 'commit',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to rollback (for file scope)',
        },
        to_ref: {
          type: 'string',
          description: 'Git ref to rollback to (default: HEAD~1)',
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview rollback without applying',
          default: false,
        },
      },
      required: ['trigger'],
    },
  },
  {
    name: 'retry_with_learning',
    description: 'Retry a failed operation with progressive fix strategies. Analyzes error patterns, applies fixes, and retries. Tracks attempt history to avoid repeating failed approaches. Useful for self-healing code changes.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'Description of the operation to retry',
        },
        command: {
          type: 'string',
          description: 'Command to execute and retry',
        },
        max_attempts: {
          type: 'integer',
          description: 'Maximum retry attempts (default: 3)',
          default: 3,
        },
        fix_strategies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fix strategies to try: "install_deps", "fix_imports", "fix_types", "rollback"',
        },
        error_pattern: {
          type: 'string',
          description: 'Regex pattern to extract error details',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'atomic_multi_edit',
    description: 'Apply multiple file edits atomically with rollback on failure. Creates backup, applies all edits, runs validation (build/test), and rolls back everything if validation fails. Ensures codebase stays in a valid state.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              operation: { type: 'string', enum: ['replace', 'insert', 'delete', 'create'] },
              old_content: { type: 'string' },
              new_content: { type: 'string' },
              line: { type: 'integer' },
            },
          },
          description: 'List of edit operations to apply',
        },
        validation: {
          type: 'object',
          properties: {
            run_build: { type: 'boolean' },
            run_tests: { type: 'boolean' },
            run_typecheck: { type: 'boolean' },
            custom_command: { type: 'string' },
          },
          description: 'Validation to run after edits',
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview changes without applying (default: false)',
          default: false,
        },
        output_mode: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          description: 'Output verbosity: count_only (just success/fail counts), minimal (file names only), standard (+ success status, default), verbose (+ full validation output)',
          default: 'standard',
        },
      },
      required: ['edits'],
    },
  },
];
