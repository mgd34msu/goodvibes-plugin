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
 * precision_write - Create/write files with encoding support.
 */
export const precisionWriteSchema: Tool = {
  name: 'precision_write',
  description:
    'Create or write files with encoding support and multiple overwrite modes. ' +
    'Supports batch writes, automatic parent directory creation, and dry_run mode.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Array of files to write',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file to write' },
            content: { type: 'string', description: 'Content to write to the file' },
            encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
            mode: {
              type: 'string',
              enum: ['fail_if_exists', 'overwrite', 'backup'],
              description: 'Behavior when file exists (default: fail_if_exists)',
            },
          },
          required: ['path', 'content'],
        },
      },
      dry_run: { type: 'boolean', default: false, description: 'Preview changes without writing' },
      output_mode: outputModeSchema,
    },
    required: ['files'],
  },
};

/**
 * precision_exec - Execute shell commands.
 */
export const precisionExecSchema: Tool = {
  name: 'precision_exec',
  description:
    'Execute shell commands with batch support, timeout, and expectations checking. ' +
    'Captures stdout, stderr, and exit code.',
  inputSchema: {
    type: 'object',
    properties: {
      commands: {
        type: 'array',
        description: 'Array of commands to execute',
        items: {
          type: 'object',
          properties: {
            cmd: { type: 'string', description: 'Command to execute' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'integer', minimum: 1, description: 'Timeout in ms (default: 60000)' },
            env: { type: 'object', description: 'Additional environment variables' },
            expect: {
              type: 'object',
              properties: {
                exit_code: { type: 'integer', description: 'Expected exit code' },
                stdout_contains: { type: 'string', description: 'String that stdout should contain' },
                stderr_contains: { type: 'string', description: 'String that stderr should contain' },
              },
              description: 'Expectations to verify',
            },
          },
          required: ['cmd'],
        },
      },
      parallel: { type: 'boolean', default: false, description: 'Execute commands in parallel' },
      stop_on_error: { type: 'boolean', default: true, description: 'Stop on first error (sequential only)' },
      output_mode: outputModeSchema,
    },
    required: ['commands'],
  },
};

/**
 * precision_fetch - Fetch URLs with extraction modes.
 */
export const precisionFetchSchema: Tool = {
  name: 'precision_fetch',
  description:
    'Fetch URLs with native fetch. Supports batch fetching, extraction modes (raw/text/json), ' +
    'custom headers, method override, and timeout.',
  inputSchema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        description: 'Array of URL requests to fetch',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method (default: GET)' },
            headers: { type: 'object', description: 'Custom headers to send' },
            body: { type: 'string', description: 'Request body (for POST/PUT)' },
            timeout: { type: 'integer', minimum: 1, description: 'Timeout in ms (default: 30000)' },
            extract: { type: 'string', enum: ['raw', 'text', 'json'], description: 'Extraction mode (default: text)' },
          },
          required: ['url'],
        },
      },
      parallel: { type: 'boolean', default: true, description: 'Fetch URLs in parallel' },
      output_mode: outputModeSchema,
    },
    required: ['urls'],
  },
};

/**
 * discover - Lightweight parallel query execution.
 */
export const discoverSchema: Tool = {
  name: 'discover',
  description:
    'Execute multiple grep, glob, or symbol queries in parallel. ' +
    'Returns results keyed by query ID for efficient batch discovery.',
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: 'Array of queries to execute',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID for this query' },
            type: { type: 'string', enum: ['grep', 'glob', 'symbols'], description: 'Query type' },
            pattern: { type: 'string', description: 'Regex pattern (for grep)' },
            glob: { type: 'string', description: 'File filter (for grep)' },
            patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns (for glob)' },
            query: { type: 'string', description: 'Symbol name (for symbols)' },
            kinds: { type: 'array', items: { type: 'string' }, description: 'Symbol kinds (for symbols)' },
          },
          required: ['id', 'type'],
        },
      },
      output_mode: {
        type: 'string',
        enum: ['count_only', 'files_only', 'locations'],
        default: 'files_only',
        description: 'Output mode: count_only, files_only (default), or locations',
      },
    },
    required: ['queries'],
  },
};

/**
 * precision_grep - Token-efficient search with precise output control.
 */
export const precisionGrepSchema: Tool = {
  name: 'precision_grep',
  description:
    'Search for patterns with batch queries and precise output control. ' +
    'Supports count_only, files_only, locations, matches, and context modes.',
  inputSchema: {
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: 'Array of search queries to execute',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Query identifier' },
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            glob: { type: 'string', description: 'File pattern to search in' },
            path: { type: 'string', description: 'Directory path to search' },
            exclude: { type: 'array', items: { type: 'string' }, description: 'Patterns to exclude' },
            case_sensitive: { type: 'boolean', description: 'Case sensitive search' },
            whole_word: { type: 'boolean', description: 'Match whole words only' },
          },
          required: ['id', 'pattern'],
        },
      },
      output: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['count_only', 'files_only', 'locations', 'matches', 'context'] },
          context_before: { type: 'integer', minimum: 0 },
          context_after: { type: 'integer', minimum: 0 },
          max_files: { type: 'integer', minimum: 1 },
          max_matches_per_file: { type: 'integer', minimum: 1 },
          max_total_matches: { type: 'integer', minimum: 1 },
        },
        required: ['mode'],
      },
      parallel: { type: 'boolean', default: true },
      output_mode: outputModeSchema,
    },
    required: ['queries', 'output'],
  },
};

/**
 * precision_read - Read files with precise extraction modes.
 */
export const precisionReadSchema: Tool = {
  name: 'precision_read',
  description:
    'Read files with configurable extraction modes: content, outline, symbols, ast, or lines. ' +
    'Supports per-file offsets and limits.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Files to read with optional per-file settings',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                path: { type: 'string' },
                offset: { type: 'integer', minimum: 0 },
                limit: { type: 'integer', minimum: 1 },
                extract: { type: 'string', enum: ['content', 'outline', 'symbols', 'ast', 'lines'] },
              },
              required: ['path'],
            },
          ],
        },
      },
      extract: { type: 'string', enum: ['content', 'outline', 'symbols', 'ast', 'lines'], default: 'content' },
      output_mode: outputModeSchema,
    },
    required: ['files'],
  },
};

/**
 * precision_glob - Find files with intelligent filtering and presets.
 */
export const precisionGlobSchema: Tool = {
  name: 'precision_glob',
  description:
    'Find files with presets, intelligent filtering, and previews. ' +
    'Supports size/date filters, content matching, and depth limits.',
  inputSchema: {
    type: 'object',
    properties: {
      patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to match' },
      preset: { type: 'string', enum: ['typescript', 'javascript', 'styles', 'config', 'tests', 'all'] },
      exclude: { type: 'array', items: { type: 'string' } },
      filters: {
        type: 'object',
        properties: {
          min_size: { type: 'integer', minimum: 0 },
          max_size: { type: 'integer', minimum: 0 },
          modified_after: { type: 'string', format: 'date-time' },
          modified_before: { type: 'string', format: 'date-time' },
          has_content: { type: 'string', description: 'Regex to match in file content' },
          is_empty: { type: 'boolean' },
        },
      },
      output: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['count_only', 'paths_only', 'with_stats', 'with_preview'] },
          max_files: { type: 'integer', minimum: 1 },
          preview_lines: { type: 'integer', minimum: 1 },
        },
      },
      output_mode: outputModeSchema,
    },
  },
};

/**
 * precision_symbols - Search and analyze code symbols.
 */
export const precisionSymbolsSchema: Tool = {
  name: 'precision_symbols',
  description:
    'Search symbols across workspace or analyze document structure. ' +
    'Supports workspace-wide symbol search and per-file symbol extraction.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['workspace', 'document'], default: 'workspace' },
      query: { type: 'string', description: 'Symbol name pattern to search (workspace mode)' },
      match_type: { type: 'string', enum: ['exact', 'prefix', 'substring', 'fuzzy'], default: 'substring' },
      file: { type: 'string', description: 'Single file to analyze (document mode)' },
      files: { type: 'array', items: { type: 'string' }, description: 'Multiple files (document mode)' },
      kinds: { type: 'array', items: { type: 'string', enum: ['function', 'class', 'interface', 'type', 'variable', 'method', 'property', 'enum', 'constant'] } },
      line_range: {
        type: 'object',
        properties: {
          start: { type: 'integer', minimum: 1 },
          end: { type: 'integer', minimum: 1 },
        },
      },
      max_depth: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, default: 50 },
      output_mode: outputModeSchema,
    },
  },
};

/**
 * precision_edit - Atomic file editing with transactions.
 */
export const precisionEditSchema: Tool = {
  name: 'precision_edit',
  description:
    'Apply precise edits with transaction support. ' +
    'Supports line-based, search-replace, and unified diff strategies.',
  inputSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        description: 'Edit operations to perform',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Target file path' },
            strategy: { type: 'string', enum: ['line', 'search_replace', 'diff'] },
            start_line: { type: 'integer', minimum: 1, description: 'Start line (line strategy)' },
            end_line: { type: 'integer', minimum: 1, description: 'End line (line strategy)' },
            search: { type: 'string', description: 'Search pattern (search_replace strategy)' },
            content: { type: 'string', description: 'New content' },
            diff: { type: 'string', description: 'Unified diff (diff strategy)' },
            regex: { type: 'boolean', default: false },
            replace_all: { type: 'boolean', default: false },
          },
          required: ['file', 'strategy', 'content'],
        },
      },
      dry_run: { type: 'boolean', default: false },
      backup: { type: 'boolean', default: false },
      output_mode: outputModeSchema,
    },
    required: ['edits'],
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
  precisionWriteSchema,
  precisionExecSchema,
  precisionFetchSchema,
  discoverSchema,
  precisionGrepSchema,
  precisionReadSchema,
  precisionGlobSchema,
  precisionSymbolsSchema,
  precisionEditSchema,
];
