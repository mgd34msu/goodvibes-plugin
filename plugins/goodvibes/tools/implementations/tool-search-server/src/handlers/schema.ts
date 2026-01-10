/**
 * Schema Parsing Handlers - Re-export facade
 *
 * This file maintains backwards compatibility by re-exporting from the
 * modularized schema/ directory. For new code, import from './schema/index.js'.
 */

export { handleGetSchema } from './schema/index.js';
export type { GetSchemaArgs } from './schema/index.js';

export { handleGetDatabaseSchema } from './schema/index.js';
export type { GetDatabaseSchemaArgs } from './schema/index.js';
