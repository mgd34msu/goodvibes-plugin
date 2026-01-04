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
];
