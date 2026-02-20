import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const standaloneSchemas: Tool[] = [
  {
    name: 'scaffold',
    description: 'Scaffold a new project from templates with variable substitution and optional git/npm initialization.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        template: {
          type: 'string',
          description: 'Template name to scaffold from (e.g., "next-app", "vite-react", "next-saas").',
        },
        output_dir: {
          type: 'string',
          description: 'Absolute path to the output directory where the project will be created.',
        },
        variables: {
          type: 'object',
          description: 'Template variable substitutions (key-value pairs).',
          additionalProperties: { type: 'string' },
        },
        run_install: {
          type: 'boolean',
          description: 'Run npm/pnpm install after scaffolding. Defaults to false.',
        },
        run_git_init: {
          type: 'boolean',
          description: 'Run git init after scaffolding. Defaults to false.',
        },
      },
      required: ['template', 'output_dir'],
    },
  },
  {
    name: 'bundle_analyze',
    description: 'Analyze JavaScript bundle size and composition, detecting large modules, duplicates, and tree-shaking issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Project root or build output directory. Auto-detected if not specified.',
        },
        format: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: 'Detail level of the analysis report. Defaults to "summary".',
        },
      },
      required: [],
    },
  },
];
