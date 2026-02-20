import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const apiSchemas: Tool[] = [
  {
    name: 'project_api_routes',
    description: 'Discover API routes from framework files (Express, Next.js, Fastify, Hono).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Project root path to scan for routes. Defaults to current working directory.',
        },
        framework: {
          type: 'string',
          enum: ['nextjs', 'express', 'fastify', 'hono', 'auto'],
          description: 'Framework to detect routes for. Defaults to "auto" (auto-detect).',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_api_spec',
    description: 'Generate OpenAPI specification from code and route definitions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        output_path: {
          type: 'string',
          description: 'File path to write the generated spec. If omitted, returns inline.',
        },
        title: {
          type: 'string',
          description: 'API title for the OpenAPI info block.',
        },
        version: {
          type: 'string',
          description: 'API version string.',
        },
        description: {
          type: 'string',
          description: 'API description for the OpenAPI info block.',
        },
        server_url: {
          type: 'string',
          description: 'Base URL for the API server.',
        },
        include_examples: {
          type: 'boolean',
          description: 'Generate example values for request/response schemas.',
        },
        format: {
          type: 'string',
          enum: ['json', 'yaml'],
          description: 'Output format for the spec. Defaults to "json".',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_api_validate',
    description: 'Validate API implementation against its OpenAPI contract/spec by making live requests.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spec_path: {
          type: 'string',
          description: 'Path to the OpenAPI spec file (JSON or YAML).',
        },
        base_url: {
          type: 'string',
          description: 'Base URL of the running API server to validate against.',
        },
        endpoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific endpoint paths to validate. Validates all if not specified.',
        },
        include_examples: {
          type: 'boolean',
          description: 'Use spec examples as request bodies. Defaults to true.',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds. Defaults to 10000.',
        },
        auth_header: {
          type: 'string',
          description: 'Authorization header value for authenticated endpoints.',
        },
      },
      required: ['spec_path', 'base_url'],
    },
  },
  {
    name: 'project_api_sync',
    description: 'Sync TypeScript types between API backend and client, detecting type drift.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        backend_path: {
          type: 'string',
          description: 'Path to the backend API directory. Auto-detected if not specified.',
        },
        frontend_path: {
          type: 'string',
          description: 'Path to the frontend source directory. Auto-detected if not specified.',
        },
        api_pattern: {
          type: 'string',
          description: 'Regex pattern to match API call expressions in frontend code.',
        },
        auto_fix: {
          type: 'boolean',
          description: 'Automatically generate type imports to fix drift. Defaults to false.',
        },
      },
      required: [],
    },
  },
];
