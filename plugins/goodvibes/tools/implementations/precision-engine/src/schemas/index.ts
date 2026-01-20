/**
 * Tool schema definitions for precision-engine.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Common output mode schema.
 */
const outputModeSchema = {
  type: 'string' as const,
  enum: ['count_only', 'minimal', 'standard', 'verbose'],
  default: 'standard',
  description: 'Output verbosity: count_only (minimal tokens), minimal (basic info), standard (normal), verbose (full details)',
};

/**
 * batch_read - Read multiple files with per-file precision.
 */
export const batchReadSchema: Tool = {
  name: 'batch_read',
  description:
    'Read multiple files efficiently with configurable output modes. ' +
    'Supports line offsets and limits for partial reads.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Files to read - can be paths or objects with {path, offset, limit}',
        items: {
          oneOf: [
            { type: 'string', description: 'Simple file path' },
            {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path to read' },
                offset: { type: 'integer', minimum: 0, description: 'Start line (0-indexed)' },
                limit: { type: 'integer', minimum: 1, description: 'Maximum lines to read' },
              },
              required: ['path'],
            },
          ],
        },
      },
      output_mode: outputModeSchema,
    },
    required: ['files'],
  },
};

/**
 * smart_glob - Find files with intelligent filtering.
 */
export const smartGlobSchema: Tool = {
  name: 'smart_glob',
  description:
    'Find files matching glob patterns with intelligent default exclusions ' +
    '(node_modules, .git, dist, etc). Supports content preview.',
  inputSchema: {
    type: 'object',
    properties: {
      patterns: {
        type: 'array',
        items: { type: 'string' },
        description: "Glob patterns to match (e.g., ['**/*.ts', '**/*.tsx'])",
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional patterns to exclude',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        default: 100,
        description: 'Maximum files to return',
      },
      preview: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: false },
          lines: { type: 'integer', minimum: 1, default: 10 },
        },
        description: 'Include first N lines of each file as preview',
      },
      output_mode: {
        ...outputModeSchema,
        enum: ['count_only', 'minimal', 'standard'],
        description: 'count_only: just count, minimal: paths only, standard: paths with stats',
      },
    },
    required: ['patterns'],
  },
};

/**
 * grep_with_content - Search with regex and context.
 */
export const grepWithContentSchema: Tool = {
  name: 'grep_with_content',
  description:
    'Search files for regex patterns with configurable context lines. ' +
    'Supports file filtering via glob and line range restrictions.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      glob: { type: 'string', description: "Glob pattern to filter files (e.g., '**/*.ts')" },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific paths to search (alternative to glob)',
      },
      max_matches: {
        type: 'integer',
        minimum: 1,
        default: 100,
        description: 'Maximum matches to return',
      },
      context_before: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Lines of context before each match',
      },
      context_after: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Lines of context after each match',
      },
      output_mode: outputModeSchema,
    },
    required: ['pattern'],
  },
};

/**
 * atomic_multi_edit - Apply multiple edits atomically.
 */
export const atomicMultiEditSchema: Tool = {
  name: 'atomic_multi_edit',
  description:
    'Apply multiple file edits atomically with automatic rollback on failure. ' +
    'Supports replace, insert, delete, and create operations.',
  inputSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        description: 'Array of edit operations to apply',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File path to edit' },
            operation: {
              type: 'string',
              enum: ['replace', 'insert', 'delete', 'create'],
              description: 'Type of edit operation',
            },
            old_content: { type: 'string', description: 'Content to find (for replace/delete)' },
            new_content: { type: 'string', description: 'Content to insert (for replace/insert/create)' },
            position: {
              type: 'object',
              properties: {
                line: { type: 'integer', minimum: 1 },
                character: { type: 'integer', minimum: 0 },
              },
              description: 'Position for insert operation',
            },
          },
          required: ['file', 'operation'],
        },
      },
      validation: {
        type: 'object',
        properties: {
          run_typecheck: { type: 'boolean', default: false },
          run_tests: { type: 'boolean', default: false },
          run_lint: { type: 'boolean', default: false },
        },
        description: 'Validation to run after edits (triggers rollback on failure)',
      },
      dry_run: { type: 'boolean', default: false, description: 'Preview changes without applying' },
      output_mode: outputModeSchema,
    },
    required: ['edits'],
  },
};

/**
 * workspace_symbols - Search symbols across workspace.
 */
export const workspaceSymbolsSchema: Tool = {
  name: 'workspace_symbols',
  description:
    'Search for symbols (functions, classes, interfaces, etc.) across the workspace. ' +
    'Faster than grep for finding code definitions.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Symbol name to search for' },
      kinds: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['class', 'interface', 'function', 'variable', 'type', 'enum', 'method'],
        },
        description: 'Filter by symbol kinds',
      },
      limit: { type: 'integer', minimum: 1, default: 50, description: 'Maximum symbols to return' },
      output_mode: outputModeSchema,
    },
    required: ['query'],
  },
};

/**
 * get_document_symbols - Get structural outline of files.
 */
export const getDocumentSymbolsSchema: Tool = {
  name: 'get_document_symbols',
  description:
    'Get the structural outline (symbols) of one or more files. ' +
    'Returns hierarchical symbol tree showing classes, functions, methods, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'File paths to analyze',
      },
      kind_filter: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['class', 'interface', 'function', 'variable', 'type', 'enum', 'method', 'property'],
        },
        description: 'Only include these symbol kinds',
      },
      output_mode: outputModeSchema,
    },
    required: ['files'],
  },
};

/**
 * All tool schemas.
 */
export const allSchemas: Tool[] = [
  batchReadSchema,
  smartGlobSchema,
  grepWithContentSchema,
  atomicMultiEditSchema,
  workspaceSymbolsSchema,
  getDocumentSymbolsSchema,
];
