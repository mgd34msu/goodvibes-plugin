import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const depsSchemas: Tool[] = [
  {
    name: 'project_deps_analyze',
    description: 'Analyze project dependencies for outdated packages, unused imports, and duplicate versions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Project root directory. Defaults to current working directory.',
        },
        check_updates: {
          type: 'boolean',
          description: 'Fetch latest versions from npm to detect outdated packages. Defaults to false.',
        },
        include_dev: {
          type: 'boolean',
          description: 'Include devDependencies in the analysis. Defaults to true.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_deps_circular',
    description: 'Find circular dependency chains in the codebase using depth-first search.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Project root or directory to scan. Defaults to current working directory.',
        },
        include_node_modules: {
          type: 'boolean',
          description: 'Include node_modules in the dependency graph. Defaults to false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_deps_upgrade',
    description: 'Upgrade a specific package with compatibility checks, changelog analysis, and optional test execution.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        package: {
          type: 'string',
          description: 'Package name to upgrade.',
        },
        target_version: {
          type: 'string',
          description: 'Target version to upgrade to. Defaults to "latest".',
        },
        include_changelog: {
          type: 'boolean',
          description: 'Fetch and summarize the package changelog. Defaults to true.',
        },
        dry_run: {
          type: 'boolean',
          description: 'Analyze without actually installing. Defaults to false.',
        },
        run_tests_after: {
          type: 'boolean',
          description: 'Run test suite after upgrade to verify compatibility. Defaults to false.',
        },
        path: {
          type: 'string',
          description: 'Project root path. Defaults to current working directory.',
        },
      },
      required: ['package'],
    },
  },
];
