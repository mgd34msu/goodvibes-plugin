import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const securitySchemas: Tool[] = [
  {
    name: 'project_security_secrets',
    description: 'Scan files for hardcoded secrets, API keys, tokens, and other sensitive credentials.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory or file path to scan. Defaults to project root.',
        },
        include_staged: {
          type: 'boolean',
          description: 'Also scan git-staged files. Defaults to false.',
        },
        severity_threshold: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Minimum severity level to report. Defaults to "low".',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum directory depth to recurse. Auto-detected if not specified.',
        },
        check_presence_only: {
          type: 'boolean',
          description: 'Only report whether secrets exist, without showing content. Defaults to false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_security_permissions',
    description: 'Check files for dangerous permission patterns — filesystem access, network calls, process execution, and crypto usage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'string',
          description: 'Specific file to analyze for permission patterns.',
        },
        path: {
          type: 'string',
          description: 'Directory to scan recursively. Used if "file" is not specified.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_security_env',
    description: 'Audit .env files for missing, inconsistent, or undocumented environment variables.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Project root path. Defaults to current working directory.',
        },
        env_file: {
          type: 'string',
          description: 'Path to the .env file. Auto-detected if not specified.',
        },
        example_file: {
          type: 'string',
          description: 'Path to the .env.example file. Auto-detected if not specified.',
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Variable names to ignore in the audit.',
        },
        check_values: {
          type: 'boolean',
          description: 'Validate variable value formats (URLs, booleans, numbers). Defaults to false.',
        },
        scan_code: {
          type: 'boolean',
          description: 'Scan source code for used env variables. Defaults to true.',
        },
      },
      required: [],
    },
  },
];
