/**
 * Environment configuration tool schemas
 */

export const ENV_SCHEMAS = [
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
];
