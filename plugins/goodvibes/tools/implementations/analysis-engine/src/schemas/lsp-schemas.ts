/**
 * LSP (Language Server Protocol) tool schemas
 */

export const LSP_SCHEMAS = [
  {
    name: 'find_dead_code',
    description: 'Find unused exports and functions in a file or directory. Uses TypeScript Language Service to identify exports that have no external references. Useful for identifying dead code that can be safely removed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path to analyze (relative to project root)', default: '.' },
        include_tests: { type: 'boolean', description: 'Count test file references as usage (default: true)', default: true },
      },
    },
  },
  {
    name: 'get_api_surface',
    description: 'Analyze the public vs internal API surface of a module or package. Identifies exports from entry points (index.ts, package.json main) as public API, and other exports as internal. Includes type information for each export.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to analyze (relative to project root)', default: '.' },
        entry_points: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entry point files (auto-detect if not provided)',
        },
      },
    },
  },
  {
    name: 'safe_delete_check',
    description: 'Confirm a symbol has zero external usages before deleting. Provides a cleaner interface than find_references with a clear yes/no answer. Handles edge cases like self-references and same-declaration references.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based)' },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'detect_breaking_changes',
    description: 'LLM-powered tool to detect breaking API changes between git refs. Compares type signatures before/after and uses Claude to identify: function signature changes, interface/type property changes, exported symbol removals, and visibility changes. Returns breaking and non-breaking changes with migration guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        before_ref: { type: 'string', description: 'Git ref to compare from (e.g., HEAD~1, commit hash, branch name)' },
        after_ref: { type: 'string', description: 'Git ref to compare to', default: 'HEAD' },
        path: { type: 'string', description: 'Optional path filter to limit analysis to specific files/directories' },
        timeout: { type: 'integer', description: 'Timeout in seconds for LLM analysis (default: 120)', default: 120 },
        model: { type: 'string', enum: ['haiku', 'sonnet', 'opus'], description: 'Model to use: haiku (fast, default), sonnet, opus (thorough)', default: 'haiku' },
      },
      required: ['before_ref'],
    },
  },
  {
    name: 'semantic_diff',
    description: 'LLM-powered type-aware diff with semantic impact explanation. Goes beyond text-based diff to understand what semantically changed, impact on type safety and API contracts, which callers might be affected, and risk level of each change. Uses Claude for deep analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        before_ref: { type: 'string', description: 'Git ref to compare from (e.g., HEAD~1, commit hash, branch name)' },
        after_ref: { type: 'string', description: 'Git ref to compare to', default: 'HEAD' },
        file: { type: 'string', description: 'Optional specific file to analyze (if not provided, analyzes all changed files)' },
        timeout: { type: 'integer', description: 'Timeout in seconds for LLM analysis (default: 120)', default: 120 },
        model: { type: 'string', enum: ['haiku', 'sonnet', 'opus'], description: 'Model to use: haiku (fast, default), sonnet, opus (thorough)', default: 'haiku' },
      },
      required: ['before_ref'],
    },
  },
];
