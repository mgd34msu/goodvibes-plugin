/**
 * Project Engine — MCP Tool Schema Registry
 *
 * Defines all 26 MCP tool schemas organized by domain.
 * This module is the single source of truth for schema definitions
 * used by the MCP dispatch layer.
 *
 * Follows the same pattern as runtime-engine's
 * src/plugins/mcp/handlers/schemas.ts
 *
 * @module schemas
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// Code Intelligence (6)
// =============================================================================

export const codeIntelSchemas = [
  {
    name: 'project_code_dead',
    description:
      'Find dead/unused code (exports, functions, variables) in the project using TypeScript language service.',
    inputSchema: {
      type: 'object',
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
      additionalProperties: false,
    },
  },
  {
    name: 'project_code_safe_delete',
    description:
      'Check if code at a specific location can be safely deleted without breaking any external references.',
    inputSchema: {
      type: 'object',
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
      additionalProperties: false,
    },
  },
  {
    name: 'project_code_preview_edits',
    description:
      'Preview and validate code edits before applying them, checking for TypeScript errors introduced by each edit.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Array of proposed edits to validate.',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'Absolute path to the file to edit.' },
              old_text: { type: 'string', description: 'Text to replace (for find-replace edits).' },
              new_text: { type: 'string', description: 'Replacement text.' },
              content: { type: 'string', description: 'Full new content for the file (for full-file replacement).' },
            },
            required: ['file'],
            additionalProperties: false,
          },
        },
      },
      required: ['edits'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_code_breaking',
    description:
      'Detect breaking changes between two git refs by comparing exported TypeScript API signatures.',
    inputSchema: {
      type: 'object',
      properties: {
        before_ref: { type: 'string', description: 'Git ref (commit hash, branch, tag) representing the "before" state.' },
        after_ref: { type: 'string', description: 'Git ref representing the "after" state. Defaults to current working tree.' },
        path: { type: 'string', description: 'File or directory path filter for the comparison.' },
        timeout: { type: 'number', description: 'Timeout in seconds for LLM analysis. Defaults to 120.' },
        model: { type: 'string', enum: ['haiku', 'sonnet', 'opus'], description: 'LLM model to use for analysis.' },
      },
      required: ['before_ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_code_semantic_diff',
    description:
      'LLM-powered semantic diff with impact analysis — understand what changed, not just the raw diff.',
    inputSchema: {
      type: 'object',
      properties: {
        before_ref: { type: 'string', description: 'Git ref (commit hash, branch, tag) for the "before" state.' },
        after_ref: { type: 'string', description: 'Git ref for the "after" state. Defaults to current working tree.' },
        file: { type: 'string', description: 'Specific file path to diff. If omitted, diffs all changed files.' },
        timeout: { type: 'number', description: 'Timeout in seconds for LLM analysis. Defaults to 120.' },
        model: { type: 'string', enum: ['haiku', 'sonnet', 'opus'], description: 'LLM model to use for semantic analysis.' },
      },
      required: ['before_ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_code_surface',
    description:
      'Get the public API surface (exports) of files or modules, distinguishing public from internal APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory or file path to analyze. Defaults to project root.' },
        entry_points: { type: 'array', items: { type: 'string' }, description: 'Explicit entry point files to treat as public API boundaries.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// API (4)
// =============================================================================

export const apiSchemas = [
  {
    name: 'project_api_routes',
    description: 'Discover API routes from framework files (Express, Next.js, Fastify, Hono).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path to scan for routes. Defaults to current working directory.' },
        framework: { type: 'string', enum: ['nextjs', 'express', 'fastify', 'hono', 'auto'], description: 'Framework to detect routes for. Defaults to "auto" (auto-detect).' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_api_spec',
    description: 'Generate OpenAPI specification from code and route definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'File path to write the generated spec. If omitted, returns inline.' },
        title: { type: 'string', description: 'API title for the OpenAPI info block.' },
        version: { type: 'string', description: 'API version string.' },
        description: { type: 'string', description: 'API description for the OpenAPI info block.' },
        server_url: { type: 'string', description: 'Base URL for the API server.' },
        include_examples: { type: 'boolean', description: 'Generate example values for request/response schemas.' },
        format: { type: 'string', enum: ['json', 'yaml'], description: 'Output format for the spec. Defaults to "json".' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_api_validate',
    description: 'Validate API implementation against its OpenAPI contract/spec by making live requests.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: { type: 'string', description: 'Path to the OpenAPI spec file (JSON or YAML).' },
        base_url: { type: 'string', description: 'Base URL of the running API server to validate against.' },
        endpoints: { type: 'array', items: { type: 'string' }, description: 'Specific endpoint paths to validate. Validates all if not specified.' },
        include_examples: { type: 'boolean', description: 'Use spec examples as request bodies. Defaults to true.' },
        timeout: { type: 'number', description: 'Request timeout in milliseconds. Defaults to 10000.' },
        auth_header: { type: 'string', description: 'Authorization header value for authenticated endpoints.' },
      },
      required: ['spec_path', 'base_url'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_api_sync',
    description: 'Sync TypeScript types between API backend and client, detecting type drift.',
    inputSchema: {
      type: 'object',
      properties: {
        backend_path: { type: 'string', description: 'Path to the backend API directory. Auto-detected if not specified.' },
        frontend_path: { type: 'string', description: 'Path to the frontend source directory. Auto-detected if not specified.' },
        api_pattern: { type: 'string', description: 'Regex pattern to match API call expressions in frontend code.' },
        auto_fix: { type: 'boolean', description: 'Automatically generate type imports to fix drift. Defaults to false.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Security (3)
// =============================================================================

export const securitySchemas = [
  {
    name: 'project_security_secrets',
    description: 'Scan files for hardcoded secrets, API keys, tokens, and other sensitive credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory or file path to scan. Defaults to project root.' },
        include_staged: { type: 'boolean', description: 'Also scan git-staged files. Defaults to false.' },
        severity_threshold: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Minimum severity level to report. Defaults to "low".' },
        max_depth: { type: 'number', description: 'Maximum directory depth to recurse. Auto-detected if not specified.' },
        check_presence_only: { type: 'boolean', description: 'Only report whether secrets exist, without showing content. Defaults to false.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_security_permissions',
    description: 'Check files for dangerous permission patterns — filesystem access, network calls, process execution, and crypto usage.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific file to analyze for permission patterns.' },
        path: { type: 'string', description: 'Directory to scan recursively. Used if "file" is not specified.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_security_env',
    description: 'Audit .env files for missing, inconsistent, or undocumented environment variables.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path. Defaults to current working directory.' },
        env_file: { type: 'string', description: 'Path to the .env file. Auto-detected if not specified.' },
        example_file: { type: 'string', description: 'Path to the .env.example file. Auto-detected if not specified.' },
        ignore: { type: 'array', items: { type: 'string' }, description: 'Variable names to ignore in the audit.' },
        check_values: { type: 'boolean', description: 'Validate variable value formats (URLs, booleans, numbers). Defaults to false.' },
        scan_code: { type: 'boolean', description: 'Scan source code for used env variables. Defaults to true.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Database (3)
// =============================================================================

export const databaseSchemas = [
  {
    name: 'project_db_schema',
    description: 'Get the database schema from ORM definitions (Prisma, Drizzle, TypeORM) or raw SQL files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to schema file or project root. Auto-detected if not specified.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_db_query',
    description: 'Execute read-only database queries against PostgreSQL, MySQL, or SQLite databases.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute.' },
        database_url: { type: 'string', description: 'Database connection URL. Reads from DATABASE_URL env var if not provided.' },
        readonly: { type: 'boolean', description: 'Enforce read-only mode (reject INSERT/UPDATE/DELETE). Defaults to true.' },
        limit: { type: 'number', description: 'Maximum number of rows to return. Defaults to 100.' },
        format: { type: 'string', enum: ['json', 'table'], description: 'Output format. Defaults to "json".' },
        explain: { type: 'boolean', description: 'Also run EXPLAIN on the query. Defaults to false.' },
        params: { type: 'array', description: 'Parameterized query values.', items: {} },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_db_prisma',
    description: 'Analyze Prisma schema and list available operations, detecting N+1 query patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root or path to Prisma schema. Auto-detected if not specified.' },
        include_n1_detection: { type: 'boolean', description: 'Detect N+1 query patterns in the codebase. Defaults to true.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Dependencies (3)
// =============================================================================

export const depsSchemas = [
  {
    name: 'project_deps_analyze',
    description: 'Analyze project dependencies for outdated packages, unused imports, and duplicate versions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root directory. Defaults to current working directory.' },
        check_updates: { type: 'boolean', description: 'Fetch latest versions from npm to detect outdated packages. Defaults to false.' },
        include_dev: { type: 'boolean', description: 'Include devDependencies in the analysis. Defaults to true.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_deps_circular',
    description: 'Find circular dependency chains in the codebase using depth-first search.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root or directory to scan. Defaults to current working directory.' },
        include_node_modules: { type: 'boolean', description: 'Include node_modules in the dependency graph. Defaults to false.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_deps_upgrade',
    description: 'Upgrade a specific package with compatibility checks, changelog analysis, and optional test execution.',
    inputSchema: {
      type: 'object',
      properties: {
        package: { type: 'string', description: 'Package name to upgrade.' },
        target_version: { type: 'string', description: 'Target version to upgrade to. Defaults to "latest".' },
        include_changelog: { type: 'boolean', description: 'Fetch and summarize the package changelog. Defaults to true.' },
        dry_run: { type: 'boolean', description: 'Analyze without actually installing. Defaults to false.' },
        run_tests_after: { type: 'boolean', description: 'Run test suite after upgrade to verify compatibility. Defaults to false.' },
        path: { type: 'string', description: 'Project root path. Defaults to current working directory.' },
      },
      required: ['package'],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Testing (2)
// =============================================================================

export const testingSchemas = [
  {
    name: 'project_test_coverage',
    description: 'Get test coverage report for the project by parsing LCOV, Istanbul, or c8 coverage files.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific source file to get coverage for.' },
        coverage_path: { type: 'string', description: 'Path to the coverage report file. Auto-detected if not specified.' },
        path: { type: 'string', description: 'Project root path. Defaults to current working directory.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'project_test_find',
    description: 'Find test files associated with a given source file, including indirect test relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to the source file to find tests for.' },
        include_indirect: { type: 'boolean', description: 'Include tests that indirectly import the source file. Defaults to false.' },
      },
      required: ['file'],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Runtime (3)
// =============================================================================

export const runtimeSchemas = [
  {
    name: 'project_runtime_memory',
    description: 'Detect potential memory leaks in a running Node.js process by monitoring heap growth over time.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['pid', 'command'], description: 'Whether to monitor an existing PID or spawn a new command.' },
        pid: { type: 'number', description: 'Process ID to monitor (required when target is "pid").' },
        command: { type: 'string', description: 'Command to spawn and monitor (required when target is "command").' },
        duration_seconds: { type: 'number', description: 'How long to monitor in seconds. Defaults to 60.' },
        snapshot_interval_ms: { type: 'number', description: 'Interval between memory snapshots in milliseconds. Defaults to 5000.' },
        threshold_mb: { type: 'number', description: 'Heap growth threshold in MB to classify as a leak. Defaults to 50.' },
        cwd: { type: 'string', description: 'Working directory for spawned commands.' },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_runtime_profile',
    description: 'Profile a function execution for performance bottlenecks, measuring timing and memory statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to the file containing the function to profile.' },
        function_name: { type: 'string', description: 'Name of the exported function to profile.' },
        inputs: { type: 'array', description: 'Input arguments to pass to the function.', items: {} },
        iterations: { type: 'number', description: 'Number of times to run the function for timing. Defaults to 100.' },
        warmup: { type: 'number', description: 'Number of warmup runs before timing. Defaults to 10.' },
        capture_memory: { type: 'boolean', description: 'Also capture heap memory delta. Defaults to false.' },
        timeout: { type: 'number', description: 'Timeout per invocation in milliseconds. Defaults to 5000.' },
      },
      required: ['file', 'function_name', 'inputs'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_runtime_logs',
    description: 'Analyze application logs for patterns, anomalies, error frequency, and rate changes.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['file', 'command'], description: 'Whether to read from a log file or capture output from a command.' },
        path: { type: 'string', description: 'Path to the log file (required when source is "file").' },
        command: { type: 'string', description: 'Command to run and capture output from (required when source is "command").' },
        duration_seconds: { type: 'number', description: 'How long to capture command output in seconds. Defaults to 30.' },
        tail_lines: { type: 'number', description: 'Number of lines from the end of the log file to analyze. Defaults to 1000.' },
        structured: { type: 'boolean', description: 'Parse as structured JSON logs. Auto-detected if not specified.' },
        patterns: {
          type: 'array',
          description: 'Custom patterns to count in the logs.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              pattern: { type: 'string' },
            },
            required: ['name', 'pattern'],
            additionalProperties: false,
          },
        },
        time_window: { type: 'string', description: 'Time window for rate analysis (e.g., "1h", "30m", "1d").' },
        cwd: { type: 'string', description: 'Working directory for spawned commands.' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Standalone (2)
// =============================================================================

export const standaloneSchemas = [
  {
    name: 'scaffold',
    description: 'Scaffold a new project from templates with variable substitution and optional git/npm initialization.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Template name to scaffold from (e.g., "next-app", "vite-react", "next-saas").' },
        output_dir: { type: 'string', description: 'Absolute path to the output directory where the project will be created.' },
        variables: { type: 'object', description: 'Template variable substitutions (key-value pairs).', additionalProperties: { type: 'string' } },
        run_install: { type: 'boolean', description: 'Run npm/pnpm install after scaffolding. Defaults to false.' },
        run_git_init: { type: 'boolean', description: 'Run git init after scaffolding. Defaults to false.' },
      },
      required: ['template', 'output_dir'],
      additionalProperties: false,
    },
  },
  {
    name: 'bundle_analyze',
    description: 'Analyze JavaScript bundle size and composition, detecting large modules, duplicates, and tree-shaking issues.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root or build output directory. Auto-detected if not specified.' },
        format: { type: 'string', enum: ['summary', 'detailed'], description: 'Detail level of the analysis report. Defaults to "summary".' },
      },
      required: [],
      additionalProperties: false,
    },
  },
] as const satisfies readonly Tool[];

// =============================================================================
// Aggregated Export
// =============================================================================

/**
 * All 26 tool schemas provided by project-engine v2.0.0.
 * Contains schemas across 8 domains:
 *   - Code Intelligence: 6 (project_code_dead, project_code_safe_delete,
 *     project_code_preview_edits, project_code_breaking,
 *     project_code_semantic_diff, project_code_surface)
 *   - API: 4 (project_api_routes, project_api_spec, project_api_validate, project_api_sync)
 *   - Security: 3 (project_security_secrets, project_security_permissions, project_security_env)
 *   - Database: 3 (project_db_schema, project_db_query, project_db_prisma)
 *   - Dependencies: 3 (project_deps_analyze, project_deps_circular, project_deps_upgrade)
 *   - Testing: 2 (project_test_coverage, project_test_find)
 *   - Runtime: 3 (project_runtime_memory, project_runtime_profile, project_runtime_logs)
 *   - Standalone: 2 (scaffold, bundle_analyze)
 */
export const allSchemas: readonly Tool[] = [
  ...codeIntelSchemas,
  ...apiSchemas,
  ...securitySchemas,
  ...databaseSchemas,
  ...depsSchemas,
  ...testingSchemas,
  ...runtimeSchemas,
  ...standaloneSchemas,
];
