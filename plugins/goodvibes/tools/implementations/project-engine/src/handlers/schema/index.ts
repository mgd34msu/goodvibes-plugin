/**
 * Schema parsing handlers
 *
 * Supports multiple ORM/database schema formats:
 * - Prisma
 * - Drizzle
 * - TypeORM
 * - Raw SQL
 *
 * Also includes API route parsing:
 * - Next.js (App Router & Pages Router)
 * - Express
 * - Fastify
 * - Hono
 */

import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { GetSchemaArgs } from './types.js';
import { parsePrismaSchema } from './prisma-parser.js';
import { parseDrizzleSchema } from './drizzle-parser.js';
import { parseTypeORMSchema } from './typeorm-parser.js';
import { parseSQLSchema } from './sql-parser.js';

// Re-export types for backwards compatibility
export type { GetSchemaArgs } from './types.js';

// API Routes handler
export { handleGetApiRoutes } from './api-routes.js';
export type { GetApiRoutesArgs } from './api-routes.js';

// Unified database schema handler
export { handleGetDatabaseSchema } from './database.js';
export type { GetDatabaseSchemaArgs } from './database.js';

/**
 * Handle get_schema tool call
 */
export function handleGetSchema(args: GetSchemaArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

  switch (args.source) {
    case 'prisma':
      return parsePrismaSchema(projectPath, args.tables);
    case 'drizzle':
      return parseDrizzleSchema(projectPath, args.tables);
    case 'typeorm':
      return parseTypeORMSchema(projectPath, args.tables);
    case 'sql':
      return parseSQLSchema(projectPath, args.tables);
    default:
      throw new Error(`Unknown schema source: ${args.source}. Supported: prisma, drizzle, typeorm, sql`);
  }
}
