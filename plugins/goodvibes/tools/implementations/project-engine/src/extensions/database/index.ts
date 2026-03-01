/**
 * Database extensions barrel
 *
 * Re-exports all database MCP tool handlers.
 *
 * @module extensions/database
 */

export { getDatabaseSchema } from './schema.js';
export { getPrismaOperations } from './prisma.js';
export { queryDatabase, executeQuery } from './query.js';
