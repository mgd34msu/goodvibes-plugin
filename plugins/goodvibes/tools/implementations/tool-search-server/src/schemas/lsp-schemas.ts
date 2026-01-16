/**
 * LSP (Language Server Protocol) tool schemas
 */

export const LSP_SCHEMAS = [
  {
    name: 'find_references',
    description: 'Find all references to a symbol at a given position. Returns file locations, preview lines, and metadata for each reference.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based)' },
        include_definition: { type: 'boolean', description: 'Include the definition in results', default: false },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'go_to_definition',
    description: 'Go to the definition of a symbol at a given position. Returns location(s) where the symbol is defined, including file, line, column, and a preview.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based)' },
        include_type_definitions: { type: 'boolean', description: 'Include type definitions in addition to value definitions', default: false },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'get_implementations',
    description: 'Find all concrete implementations of an interface or abstract method. Critical for polymorphic code - go_to_definition goes to the interface, find_references finds usages - this tells you what code actually RUNS.',
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
    name: 'rename_symbol',
    description: 'Get all edits needed to rename a symbol across the codebase. Returns file locations and text changes for a safe rename operation.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based)' },
        new_name: { type: 'string', description: 'The new name for the symbol' },
      },
      required: ['file', 'line', 'column', 'new_name'],
    },
  },
  {
    name: 'get_code_actions',
    description: 'Get available code actions (quick fixes, refactorings) at a position. Returns TypeScript Language Service code fixes and refactoring suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root or absolute)' },
        line: { type: 'integer', description: 'Start line number (1-based)' },
        column: { type: 'integer', description: 'Start column number (1-based)' },
        end_line: { type: 'integer', description: 'End line number (optional, for range)' },
        end_column: { type: 'integer', description: 'End column number (optional, for range)' },
        only: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific action kinds (e.g., "quickfix", "refactor")',
        },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'apply_code_action',
    description: 'Get the file edits for a code action (does not apply them directly). Use with get_code_actions to first see available actions.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path where the action was retrieved' },
        line: { type: 'integer', description: 'Line where the action was retrieved (1-based)' },
        column: { type: 'integer', description: 'Column where the action was retrieved (1-based)' },
        action_title: { type: 'string', description: 'The exact title of the action to apply' },
      },
      required: ['file', 'line', 'column', 'action_title'],
    },
  },
  {
    name: 'get_symbol_info',
    description: 'Get detailed information about a symbol at a given position. Returns type info, documentation, definition location, and modifiers.',
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
    name: 'get_call_hierarchy',
    description: 'Get the call hierarchy for a symbol at a given position. Returns incoming calls (who calls this function) and/or outgoing calls (what this function calls). Useful for understanding code flow and impact analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based)' },
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'both'],
          description: 'Direction of call hierarchy to retrieve',
          default: 'both',
        },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'get_type_hierarchy',
    description: 'Get the full type inheritance hierarchy for a symbol at a given position. Returns supertypes (what this type extends/implements) and subtypes (what extends/implements this type). Essential for understanding class relationships and impact analysis when modifying base classes.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based)' },
        direction: {
          type: 'string',
          enum: ['supertypes', 'subtypes', 'both'],
          description: 'Direction of type hierarchy to retrieve',
          default: 'both',
        },
        depth: {
          type: 'integer',
          description: 'Maximum depth to traverse in hierarchy tree (default: 5)',
          default: 5,
        },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'get_document_symbols',
    description: 'Get the structural outline of a document (classes, functions, interfaces, etc.). Returns a hierarchical tree of symbols with their positions and kinds. Useful for understanding document structure and navigation.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root or absolute)' },
      },
      required: ['file'],
    },
  },
  {
    name: 'get_signature_help',
    description: 'Get signature help at a function call site. Returns function parameter information including types, documentation, and which parameter the cursor is currently on. Useful for understanding function signatures while typing function arguments.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root)' },
        line: { type: 'integer', description: 'Line number (1-based)' },
        column: { type: 'integer', description: 'Column number (1-based, should be inside function call parentheses)' },
      },
      required: ['file', 'line', 'column'],
    },
  },
  {
    name: 'get_diagnostics',
    description: 'Get all TypeScript diagnostics for a file or the entire project. Returns errors, warnings, and optionally suggestions with available quick fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root). If not provided, checks all project files.' },
        include_suggestions: { type: 'boolean', description: 'Include suggestion diagnostics (default: false)', default: false },
      },
    },
  },
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
    name: 'get_inlay_hints',
    description: 'Get inlay hints for a file to see inferred types where they\'re implicit. Returns hints for inferred return types, variable types, parameter names at call sites, and inferred type arguments. Helps understand code that doesn\'t have explicit type annotations.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root or absolute)' },
        start_line: { type: 'integer', description: 'Start line of range to get hints for (1-based, optional - defaults to 1)' },
        end_line: { type: 'integer', description: 'End line of range to get hints for (1-based, optional - defaults to end of file)' },
      },
      required: ['file'],
    },
  },
  {
    name: 'workspace_symbols',
    description: 'Search for symbols by name across the entire workspace with semantic awareness. Unlike grep, this distinguishes between a function named `foo` vs a variable named `foo`. Returns symbol name, kind, location, and container information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Symbol name or partial name to search for' },
        kind: {
          type: 'string',
          enum: ['all', 'class', 'interface', 'function', 'variable', 'type', 'enum', 'method', 'property', 'module'],
          description: 'Filter by symbol kind (default: all)',
          default: 'all',
        },
        limit: { type: 'integer', description: 'Maximum number of results (default: 50, max: 200)', default: 50 },
        match_type: {
          type: 'string',
          enum: ['exact', 'prefix', 'substring'],
          description: 'How to match the query (default: substring)',
          default: 'substring',
        },
      },
      required: ['query'],
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
