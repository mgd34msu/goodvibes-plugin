/**
 * Tool schema definitions for MCP server
 */

export const TOOL_SCHEMAS = [
  // Core search tools
  {
    name: 'search_skills',
    description: 'Search the skill registry for relevant skills based on keywords or task description',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query or keywords' },
        category: { type: 'string', description: 'Optional category filter' },
        limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_agents',
    description: 'Search for specialized agents by expertise area',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords describing expertise needed' },
        limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_tools',
    description: 'Search for available tools by functionality',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords describing tool functionality' },
        limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'recommend_skills',
    description: 'Analyze task and recommend relevant skills',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Natural language task description' },
        max_results: { type: 'integer', description: 'Max recommendations (default: 5)', default: 5 },
      },
      required: ['task'],
    },
  },
  // Content retrieval
  {
    name: 'get_skill_content',
    description: 'Load full content of a skill by path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Skill path from registry' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_agent_content',
    description: 'Load full content of an agent by path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Agent path from registry' },
      },
      required: ['path'],
    },
  },
  {
    name: 'skill_dependencies',
    description: 'Show skill relationships and dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill to analyze' },
        depth: { type: 'integer', description: 'Dependency tree depth (default: 2)', default: 2 },
        include_optional: { type: 'boolean', description: 'Include optional deps', default: true },
      },
      required: ['skill'],
    },
  },
  // Context gathering
  {
    name: 'detect_stack',
    description: 'Analyze project to identify technology stack',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path', default: '.' },
        deep: { type: 'boolean', description: 'Deep analysis', default: false },
      },
    },
  },
  {
    name: 'check_versions',
    description: 'Get installed package versions',
    inputSchema: {
      type: 'object',
      properties: {
        packages: { type: 'array', items: { type: 'string' }, description: 'Packages to check' },
        check_latest: { type: 'boolean', description: 'Compare against latest', default: false },
        path: { type: 'string', description: 'Project path', default: '.' },
      },
    },
  },
  {
    name: 'scan_patterns',
    description: 'Identify existing code patterns and conventions',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to scan', default: 'src' },
        pattern_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Pattern types to detect',
          default: ['all'],
        },
      },
    },
  },
  // Live data
  {
    name: 'fetch_docs',
    description: 'Fetch current documentation for a library',
    inputSchema: {
      type: 'object',
      properties: {
        library: { type: 'string', description: 'Library or framework name' },
        topic: { type: 'string', description: 'Specific topic to look up' },
        version: { type: 'string', description: 'Specific version', default: 'latest' },
      },
      required: ['library'],
    },
  },
  {
    name: 'get_schema',
    description: 'Introspect database schema',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['prisma', 'drizzle', 'typeorm', 'sql'],
          description: 'Schema source type',
        },
        path: { type: 'string', description: 'Path to schema file', default: '.' },
        tables: { type: 'array', items: { type: 'string' }, description: 'Filter tables' },
      },
      required: ['source'],
    },
  },
  {
    name: 'get_database_schema',
    description: 'Auto-detect and extract database schema from project files. Checks for Prisma, Drizzle, and SQL schema files. Returns unified schema with tables, columns, indexes, and relations.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path to search for schema files', default: '.' },
      },
    },
  },
  {
    name: 'get_api_routes',
    description: 'Extract API routes from web frameworks. Supports Next.js (App Router & Pages Router), Express, Fastify, and Hono. Returns HTTP method, path, handler location, and middleware information.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path to scan for API routes', default: '.' },
        framework: {
          type: 'string',
          enum: ['nextjs', 'express', 'fastify', 'hono', 'auto'],
          description: 'Framework to scan for (auto-detect if not specified)',
          default: 'auto',
        },
      },
    },
  },
  {
    name: 'read_config',
    description: 'Parse existing configuration files',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'string',
          enum: ['package.json', 'tsconfig', 'eslint', 'prettier', 'tailwind', 'next', 'vite', 'prisma', 'env', 'custom'],
          description: 'Config type or filename',
        },
        path: { type: 'string', description: 'Custom path' },
        resolve_extends: { type: 'boolean', description: 'Resolve extended configs', default: true },
      },
      required: ['config'],
    },
  },
  // Validation
  {
    name: 'validate_implementation',
    description: 'Check code matches skill patterns',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files to validate' },
        skill: { type: 'string', description: 'Skill that was applied' },
        checks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Validation checks to run',
          default: ['all'],
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'run_smoke_test',
    description: 'Quick verification generated code works',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['build', 'typecheck', 'lint', 'import', 'all'],
          description: 'Type of smoke test',
          default: 'all',
        },
        files: { type: 'array', items: { type: 'string' }, description: 'Specific files to test' },
        timeout: { type: 'integer', description: 'Timeout in seconds', default: 30 },
      },
    },
  },
  {
    name: 'check_types',
    description: 'Run TypeScript type checking',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files to check' },
        strict: { type: 'boolean', description: 'Use strict mode', default: false },
        include_suggestions: { type: 'boolean', description: 'Include fix suggestions', default: true },
      },
    },
  },
  // Scaffolding
  {
    name: 'scaffold_project',
    description: 'Create a new project from a template',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Template name (next-app, vite-react, next-saas)' },
        output_dir: { type: 'string', description: 'Output directory for new project' },
        variables: { type: 'object', description: 'Template variables', additionalProperties: true },
        run_install: { type: 'boolean', description: 'Run npm install', default: true },
        run_git_init: { type: 'boolean', description: 'Initialize git', default: true },
      },
      required: ['template', 'output_dir'],
    },
  },
  {
    name: 'list_templates',
    description: 'List available project templates',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category (minimal, full)' },
      },
    },
  },
  {
    name: 'plugin_status',
    description: 'Check GoodVibes plugin health: manifest, registries, hooks, MCP server status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // Project health
  {
    name: 'project_issues',
    description: 'Get detailed project issues: high-priority TODOs with file:line, health warnings, environment issues',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path', default: '.' },
        include_low_priority: { type: 'boolean', description: 'Include low-priority TODOs', default: false },
      },
    },
  },
  // LSP Tools
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
  // Inlay Hints
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
  // Workspace Symbols
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
  // Error Tools
  {
    name: 'parse_error_stack',
    description: 'Parse error stack traces and provide structured analysis. Extracts file paths, line numbers, and function names. Maps frames to project files and identifies root cause.',
    inputSchema: {
      type: 'object',
      properties: {
        error_text: { type: 'string', description: 'The full error message and stack trace' },
        project_path: { type: 'string', description: 'Project root path for mapping files (defaults to cwd)' },
      },
      required: ['error_text'],
    },
  },
  // Dependency Analysis
  {
    name: 'analyze_dependencies',
    description: 'Analyze npm dependencies to find unused, missing, and outdated packages. Compares declared dependencies in package.json against actual imports in source files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path', default: '.' },
        check_updates: { type: 'boolean', description: 'Check npm registry for latest versions (slower)', default: false },
        include_dev: { type: 'boolean', description: 'Include devDependencies in analysis', default: true },
      },
    },
  },
  {
    name: 'find_circular_deps',
    description: 'Detect circular import dependencies in the codebase. Builds an import graph by parsing all source files and uses DFS to detect cycles. Returns all cycles found with the full file paths involved.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to scan (relative to project root or absolute)', default: '.' },
        include_node_modules: { type: 'boolean', description: 'Include node_modules in scan', default: false },
      },
    },
  },
  // Test Tools
  {
    name: 'find_tests_for_file',
    description: 'Find test files that cover a given source file. Analyzes test file naming patterns and import graphs to find related tests. Returns a ranked list of test files with confidence scores.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Source file path (relative to project root or absolute)' },
        include_indirect: { type: 'boolean', description: 'Include tests that import files which import this file', default: false },
      },
      required: ['file'],
    },
  },
  {
    name: 'get_test_coverage',
    description: 'Parse test coverage reports and map coverage data to functions. Finds coverage files (lcov.info, coverage-final.json, etc.) and extracts line, branch, function, and statement coverage percentages. Returns uncovered lines and functions for targeted test writing.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific source file to check coverage for (relative to project root)' },
        path: { type: 'string', description: 'Path to project or coverage directory (defaults to PROJECT_ROOT)' },
        coverage_path: { type: 'string', description: 'Alias for path - path to coverage report directory or file' },
      },
    },
  },
  {
    name: 'suggest_test_cases',
    description: 'Analyze a function and suggest comprehensive test cases. Uses LLM-powered analysis to identify edge cases, error conditions, boundary values, and happy path scenarios. Finds existing tests for context and suggests new test cases with rationale.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Source file containing the function (relative to project root or absolute)' },
        function: { type: 'string', description: 'Name of the function to analyze' },
        include_existing: { type: 'boolean', description: 'Include existing tests for context (default true)', default: true },
      },
      required: ['file', 'function'],
    },
  },
  // Security
  {
    name: 'scan_for_secrets',
    description: 'Scan source files for potential secrets, credentials, and sensitive data. Detects common secret patterns including API keys, tokens, passwords, private keys, and database connection strings.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to scan for secrets', default: '.' },
        include_staged: { type: 'boolean', description: 'Also check git staged files', default: true },
        severity_threshold: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Minimum severity level to report',
          default: 'low',
        },
      },
    },
  },
  // Error Explanation
  {
    name: 'explain_type_error',
    description: 'Explain TypeScript error codes in human-friendly terms with fix suggestions. Takes an error code and message, returns detailed explanation, common causes, and actionable fix suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        error_code: { type: 'integer', description: 'TypeScript error code (e.g., 2322, 2339, 7006)' },
        error_message: { type: 'string', description: 'The full error message from TypeScript' },
        context: { type: 'string', description: 'Optional code snippet where the error occurred' },
      },
      required: ['error_code', 'error_message'],
    },
  },
  // Project Tools
  {
    name: 'get_env_config',
    description: 'Find all environment variable usages and their sources. Scans source files for process.env.*, import.meta.env.*, Deno.env.* and cross-references with .env files to identify documented vs undocumented variables.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path to analyze', default: '.' },
      },
    },
  },
  {
    name: 'get_conventions',
    description: 'LLM-powered analysis of code patterns and conventions in a project. Samples files from different parts of the codebase, analyzes naming conventions, import patterns, file structure, testing patterns, and error handling. Uses Claude to synthesize findings into actionable convention guidelines.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to analyze (relative to project root)', default: '.' },
        focus: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['naming', 'imports', 'structure', 'testing', 'error-handling'],
          },
          description: 'Specific areas to focus analysis on. If empty, analyzes all areas.',
          default: [],
        },
      },
    },
  },
  // LLM-Powered LSP Tools
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
  // Framework Tools
  {
    name: 'get_react_component_tree',
    description: 'Parse JSX/TSX files and build a component hierarchy tree. Uses static AST analysis to find component definitions and usages, extract props, and build parent-child relationships. Useful for understanding React component architecture.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific component file to analyze (relative to project root)' },
        path: { type: 'string', description: 'Directory to analyze for components', default: 'src' },
        root_component: { type: 'string', description: 'Start analysis from a specific component name' },
        depth: { type: 'integer', description: 'Maximum depth to traverse in component tree', default: 5 },
      },
    },
  },
  {
    name: 'get_prisma_operations',
    description: 'Find all Prisma client usages in the codebase and detect N+1 query patterns. Scans for prisma.model.operation() calls, identifies which models are used most, and detects queries inside loops that may cause performance issues.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to analyze for Prisma operations', default: 'src' },
        include_n1_detection: { type: 'boolean', description: 'Run N+1 pattern detection', default: true },
      },
    },
  },
  // Build Analysis Tools
  {
    name: 'analyze_bundle',
    description: 'Analyze bundle size, duplicates, and tree-shaking issues in build output. Scans dist/, .next/, or build/ directories for bundle files and reports total size, chunk breakdown, largest modules, duplicate dependencies, and optimization recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Build output directory (auto-detects dist/, .next/, build/ if not specified)' },
        format: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: 'Output format - summary shows top chunks, detailed shows all',
          default: 'summary',
        },
      },
    },
  },
  {
    name: 'check_permissions',
    description: 'Analyze file, network, and system access patterns in code. Scans for fs, net, child_process, http(s) imports and usages. Categorizes findings by type (filesystem, network, process, crypto) and risk level.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific file to analyze (optional)' },
        path: { type: 'string', description: 'Directory to scan (defaults to current directory)', default: '.' },
      },
    },
  },
  // Edit Validation
  {
    name: 'validate_edits_preview',
    description: 'Preview the impact of proposed edits before applying them. Creates a virtual snapshot with edits applied and runs TypeScript diagnostics to detect any new errors that would be introduced. Does NOT modify any files - purely a validation/preview operation. Useful for fail-fast validation before writing code.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'List of proposed edits to validate',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'File path (relative to project root or absolute)' },
              old_text: { type: 'string', description: 'Text to replace (for replacement edits)' },
              new_text: { type: 'string', description: 'Replacement text (used with old_text)' },
              content: { type: 'string', description: 'Full file content (for full file replacement, mutually exclusive with old_text/new_text)' },
            },
            required: ['file'],
          },
        },
      },
      required: ['edits'],
    },
  },
];
