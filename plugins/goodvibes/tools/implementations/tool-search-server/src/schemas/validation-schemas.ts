/**
 * Validation tool schemas - implementation validation, smoke tests, type checking
 */

export const VALIDATION_SCHEMAS = [
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
  {
    name: 'validate_edits_preview',
    description: 'Preview the impact of proposed edits before applying them. Creates a virtual snapshot with edits applied and runs TypeScript diagnostics to detect any new errors that would be introduced. Does NOT modify any files - purely a validation/preview operation. Useful for fail-fast validation before writing code.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'List of proposed edits to validate',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'File path (relative to project root or absolute)' },
              old_text: { type: 'string', description: 'Text to replace (for replacement edits)' },
              new_text: { type: 'string', description: 'Replacement text (used with old_text)' },
              content: { type: 'string', description: 'Full file content (for full file replacement, mutually exclusive with old_text/new_text)' },
            },
            required: ['file'],
          },
        },
      },
      required: ['edits'],
    },
  },
  {
    name: 'validate_api_contract',
    description: 'Validate API responses against OpenAPI spec. Makes requests to each endpoint and verifies response status codes and body schemas match the spec. Reports violations with JSON paths.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_path: {
          type: 'string',
          description: 'Path to OpenAPI spec file (JSON or YAML)',
        },
        base_url: {
          type: 'string',
          description: 'Base URL of running API',
        },
        endpoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific endpoints to test (default: all)',
        },
        include_examples: {
          type: 'boolean',
          description: 'Use spec examples as request data (default: true)',
          default: true,
        },
        timeout: {
          type: 'integer',
          description: 'Per-request timeout in ms (default: 10000)',
          default: 10000,
        },
        auth_header: {
          type: 'string',
          description: 'Authorization header value if needed',
        },
      },
      required: ['spec_path', 'base_url'],
    },
  },
  {
    name: 'validate_env_complete',
    description: 'Validate environment variables are complete and documented. Compares .env against .env.example and code usage to identify missing, unused, and undocumented variables. Optionally validates value formats based on naming conventions (ports should be numbers, URLs should be valid, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        env_file: {
          type: 'string',
          description: 'Path to the .env file (default: ".env")',
          default: '.env',
        },
        example_file: {
          type: 'string',
          description: 'Path to the .env.example file (default: ".env.example")',
          default: '.env.example',
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Variable names to ignore during validation',
        },
        check_values: {
          type: 'boolean',
          description: 'Validate value formats based on variable naming (e.g., PORT should be numeric)',
          default: false,
        },
      },
    },
  },
];
