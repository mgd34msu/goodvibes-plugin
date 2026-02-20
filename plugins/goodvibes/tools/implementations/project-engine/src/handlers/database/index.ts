/**
 * Database domain handlers.
 *
 * Provides 3 tools for database operations:
 * - project_db_schema: Detect and parse database schemas (Prisma, Drizzle, TypeORM, raw SQL)
 * - project_db_query: Execute read-only database queries (PostgreSQL, MySQL, SQLite)
 * - project_db_prisma: Analyze Prisma schema operations and relationships
 */

export { handleGetDatabaseSchema } from './schema.js';
export { handleQueryDatabase } from './query-database/index.js';
export { handleGetPrismaOperations } from './prisma.js';
