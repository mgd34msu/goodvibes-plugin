/**
 * Dependency analysis tool schemas
 */

export const DEPS_SCHEMAS = [
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
