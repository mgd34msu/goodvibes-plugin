import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const databaseSchemas: Tool[] = [
  {
    name: 'project_db_schema',
    description: 'Get the database schema from ORM definitions (Prisma, Drizzle, TypeORM) or raw SQL files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to schema file or project root. Auto-detected if not specified.',
        },
      },
      required: [],
    },
  },
  {
    name: 'project_db_query',
    description: 'Execute read-only database queries against PostgreSQL, MySQL, or SQLite databases.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute.',
        },
        database_url: {
          type: 'string',
          description: 'Database connection URL. Reads from DATABASE_URL env var if not provided.',
        },
        readonly: {
          type: 'boolean',
          description: 'Enforce read-only mode (reject INSERT/UPDATE/DELETE). Defaults to true.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return. Defaults to 100.',
        },
        format: {
          type: 'string',
          enum: ['json', 'table'],
          description: 'Output format. Defaults to "json".',
        },
        explain: {
          type: 'boolean',
          description: 'Also run EXPLAIN on the query. Defaults to false.',
        },
        params: {
          type: 'array',
          description: 'Parameterized query values.',
          items: {},
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'project_db_prisma',
    description: 'Analyze Prisma schema and list available operations, detecting N+1 query patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Project root or path to Prisma schema. Auto-detected if not specified.',
        },
        include_n1_detection: {
          type: 'boolean',
          description: 'Detect N+1 query patterns in the codebase. Defaults to true.',
        },
      },
      required: [],
    },
  },
];
