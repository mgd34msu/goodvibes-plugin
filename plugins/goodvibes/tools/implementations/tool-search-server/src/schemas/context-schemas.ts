/**
 * Context gathering tool schemas - stack detection, patterns, versions, docs, config
 */

export const CONTEXT_SCHEMAS = [
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
];
