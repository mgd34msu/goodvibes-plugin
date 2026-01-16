/**
 * Type generation and fixture tool schemas
 */

export const TYPES_SCHEMAS = [
  {
    name: 'generate_types',
    description: 'Generate TypeScript types from various sources: JSON data, API responses, database schemas, or runtime values. Infers types from sample data and generates .d.ts or interface definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['json', 'api', 'database', 'runtime'],
          description: 'Source to generate types from',
        },
        input: {
          type: 'string',
          description: 'Input path, URL, or JSON string depending on source',
        },
        output: {
          type: 'string',
          description: 'Output file path for generated types',
        },
        name: {
          type: 'string',
          description: 'Root type/interface name',
        },
        options: {
          type: 'object',
          properties: {
            optional_by_default: { type: 'boolean' },
            use_type: { type: 'boolean' },
            export: { type: 'boolean' },
          },
          description: 'Generation options',
        },
      },
      required: ['source', 'input'],
    },
  },
  {
    name: 'generate_fixture',
    description: 'Generate test fixtures from Prisma/TypeScript schemas with smart data generation. Supports optional @faker-js/faker integration for realistic data. Can generate multiple output formats including JSON, TypeScript constants, and Prisma seed scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Prisma model name or TypeScript type name to generate fixtures for',
        },
        schema_path: {
          type: 'string',
          description: 'Path to schema file (default: auto-detect prisma/schema.prisma)',
        },
        count: {
          type: 'integer',
          description: 'Number of fixtures to generate (default: 1, max: 100)',
          default: 1,
        },
        overrides: {
          type: 'object',
          description: 'Specific values to use for fields, overriding generated values',
          additionalProperties: true,
        },
        with_relations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Include related models in fixtures (specify relation field names)',
        },
        scenario: {
          type: 'string',
          enum: ['empty', 'minimal', 'realistic', 'edge_cases'],
          description: 'Data style: empty (minimal required), minimal (required + few optional), realistic (all fields with realistic data), edge_cases (boundary values, special chars)',
          default: 'realistic',
        },
        output_format: {
          type: 'string',
          enum: ['json', 'typescript', 'prisma_seed'],
          description: 'Output format: json (raw array), typescript (typed const), prisma_seed (seed script)',
          default: 'json',
        },
      },
      required: ['model'],
    },
  },
  {
    name: 'sync_api_types',
    description: 'Detect type drift between backend API routes and frontend API calls. Compares types defined in backend route handlers with types used in frontend fetch/axios calls to identify mismatches, missing types, and endpoints that don\'t exist.',
    inputSchema: {
      type: 'object',
      properties: {
        backend_path: {
          type: 'string',
          description: 'Path to backend API routes (default: auto-detect from src/app/api, pages/api, src/routes)',
        },
        frontend_path: {
          type: 'string',
          description: 'Path to frontend source files',
          default: 'src',
        },
        api_pattern: {
          type: 'string',
          description: 'Regex pattern to identify API call sites',
          default: 'fetch|axios|api\\.',
        },
        auto_fix: {
          type: 'boolean',
          description: 'Generate fix suggestions for drifts',
          default: false,
        },
      },
    },
  },
];
