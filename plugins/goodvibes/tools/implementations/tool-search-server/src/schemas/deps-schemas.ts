/**
 * Dependency analysis tool schemas
 */

export const DEPS_SCHEMAS = [
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
];
