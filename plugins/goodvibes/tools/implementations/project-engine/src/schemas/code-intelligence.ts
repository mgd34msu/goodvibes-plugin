import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const codeIntelligenceSchemas: Tool[] = [
  {
    name: 'project_code_dead',
    description: 'Find dead/unused code (exports, functions, variables) in the project using TypeScript language service.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory or file path to scan. Defaults to project root.',
        },
        include_tests: {
          type: 'boolean',
          description: 'Whether to include test files in the analysis. Defaults to false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_code_safe_delete',
    description: 'Check if code at a specific location can be safely deleted without breaking any external references.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'string',
          description: 'Absolute path to the file containing the symbol to check.',
        },
        line: {
          type: 'number',
          description: 'Line number of the symbol (1-indexed).',
        },
        column: {
          type: 'number',
          description: 'Column number of the symbol (1-indexed).',
        },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'project_code_preview_edits',
    description: 'Preview and validate code edits before applying them, checking for TypeScript errors introduced by each edit.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        edits: {
          type: 'array',
          description: 'Array of proposed edits to validate.',
          items: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'Absolute path to the file to edit.',
              },
              old_text: {
                type: 'string',
                description: 'Text to replace (for find-replace edits).',
              },
              new_text: {
                type: 'string',
                description: 'Replacement text.',
              },
              content: {
                type: 'string',
                description: 'Full new content for the file (for full-file replacement).',
              },
            },
            required: ['file'],
          },
        },
      },
      required: ['edits'],
    },
  },
  {
    name: 'project_code_breaking',
    description: 'Detect breaking changes between two git refs by comparing exported TypeScript API signatures.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        before_ref: {
          type: 'string',
          description: 'Git ref (commit hash, branch, tag) representing the "before" state.',
        },
        after_ref: {
          type: 'string',
          description: 'Git ref representing the "after" state. Defaults to current working tree.',
        },
        path: {
          type: 'string',
          description: 'File or directory path filter for the comparison.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds for LLM analysis. Defaults to 120.',
        },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus'],
          description: 'LLM model to use for analysis.',
        },
      },
      required: ['before_ref'],
    },
  },
  {
    name: 'project_code_semantic_diff',
    description: 'LLM-powered semantic diff with impact analysis — understand what changed, not just the raw diff.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        before_ref: {
          type: 'string',
          description: 'Git ref (commit hash, branch, tag) for the "before" state.',
        },
        after_ref: {
          type: 'string',
          description: 'Git ref for the "after" state. Defaults to current working tree.',
        },
        file: {
          type: 'string',
          description: 'Specific file path to diff. If omitted, diffs all changed files.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds for LLM analysis. Defaults to 120.',
        },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus'],
          description: 'LLM model to use for semantic analysis.',
        },
      },
      required: ['before_ref'],
    },
  },
  {
    name: 'project_code_surface',
    description: 'Get the public API surface (exports) of files or modules, distinguishing public from internal APIs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory or file path to analyze. Defaults to project root.',
        },
        entry_points: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit entry point files to treat as public API boundaries.',
        },
      },
      required: [],
    },
  },
];
