/**
 * Project tool schemas - scaffolding, status, database, API, codebase
 */

export const PROJECT_SCHEMAS = [
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
  {
    name: 'generate_openapi',
    description: 'Generate OpenAPI 3.0.3 specification from detected API routes. Supports Next.js (App Router & Pages Router), Express, Fastify, and Hono. Extracts path parameters, attempts to parse request/response types from handlers, and generates examples.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Output file path (default: "openapi.json")', default: 'openapi.json' },
        title: { type: 'string', description: 'API title (default: from package.json name)' },
        version: { type: 'string', description: 'API version (default: from package.json version)' },
        description: { type: 'string', description: 'API description' },
        server_url: { type: 'string', description: 'Base server URL (e.g., "https://api.example.com")' },
        include_examples: { type: 'boolean', description: 'Generate examples from types (default: true)', default: true },
        format: {
          type: 'string',
          enum: ['json', 'yaml'],
          description: 'Output format (default: "json")',
          default: 'json',
        },
      },
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
  {
    name: 'query_database',
    description: 'Execute SQL queries against PostgreSQL, MySQL, or SQLite databases. Supports readonly mode (default) to prevent accidental writes, auto-LIMIT for SELECT queries, EXPLAIN output, and both JSON and table output formats. For SQLite: supports parameterized queries (?), in-memory databases (:memory:), connection pooling, and returns affected row count for write operations. Database drivers (pg, mysql2, better-sqlite3) are optional - install only the ones you need.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute. For parameterized queries, use ? placeholders.',
        },
        database_url: {
          type: 'string',
          description: 'Database connection URL. Example formats (replace with actual values): postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>, mysql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>, sqlite:///<PATH_TO_FILE>.db, sqlite::memory: (or just :memory: for in-memory), or bare paths ending in .db/.sqlite/.sqlite3.',
        },
        params: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean', 'null'] },
          description: 'Parameters for parameterized queries (replaces ? placeholders in order). Prevents SQL injection.',
        },
        readonly: {
          type: 'boolean',
          description: 'If true (default), reject INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE queries',
          default: true,
        },
        limit: {
          type: 'integer',
          description: 'Auto-add LIMIT to SELECT queries if not present (default: 100, set to 0 to disable)',
          default: 100,
        },
        format: {
          type: 'string',
          enum: ['json', 'table'],
          description: 'Output format: json (structured result object) or table (ASCII table)',
          default: 'json',
        },
        explain: {
          type: 'boolean',
          description: 'Prepend EXPLAIN to query and include execution plan in output',
          default: false,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'upgrade_package',
    description: 'Upgrade an npm package with comprehensive breaking change detection. Analyzes changelog for breaking changes, checks which packages depend on this one, and optionally runs tests after upgrade. Supports dry run mode for safe preview before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        package: {
          type: 'string',
          description: 'Name of the npm package to upgrade',
        },
        target_version: {
          type: 'string',
          description: 'Target version to upgrade to (default: "latest")',
          default: 'latest',
        },
        include_changelog: {
          type: 'boolean',
          description: 'Fetch and analyze release notes for breaking changes (default: true)',
          default: true,
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview only, do not actually upgrade (default: true)',
          default: true,
        },
        run_tests_after: {
          type: 'boolean',
          description: 'Run tests after upgrade to verify compatibility (default: false)',
          default: false,
        },
        path: {
          type: 'string',
          description: 'Project root path (defaults to current directory)',
        },
      },
      required: ['package'],
    },
  },
  {
    name: 'explain_codebase',
    description: 'Generate a high-level explanation of a codebase using LLM analysis. Gathers information from stack detection, API routes, conventions, and directory structure to produce a comprehensive overview including architecture diagrams, key files, entry points, and potential concerns.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to analyze (defaults to project root)',
          default: '.',
        },
        depth: {
          type: 'string',
          enum: ['shallow', 'medium', 'deep'],
          description: 'Analysis depth: shallow (fast overview), medium (default, balanced), deep (thorough analysis)',
          default: 'medium',
        },
        focus: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific areas to detail (e.g., ["auth", "api", "database"])',
        },
        refresh: {
          type: 'boolean',
          description: 'Regenerate even if cached (default: false)',
          default: false,
        },
        include_architecture: {
          type: 'boolean',
          description: 'Generate ASCII architecture diagram (default: true)',
          default: true,
        },
      },
    },
  },
];
