/**
 * Database core module barrel
 *
 * Re-exports all public types, constants, utilities, and functions
 * from the database core layer for use by extensions and handlers.
 *
 * @module core/database
 */

export type {
  DatabaseColumn,
  DatabaseIndex,
  DatabaseTable,
  DatabaseRelation,
  SchemaSource,
  DatabaseSchemaResult,
  DatabaseSchemaArgs,
  PrismaOpsArgs,
  SqliteDatabase,
  SqliteConnectionOptions,
  QueryDatabaseArgs,
  QueryResult,
  ColumnInfo,
  ExecutionResult,
  ExecutionOptions,
  DatabaseConnectionInfo,
  DatabaseDriver,
} from './types.js';

export { PRISMA_OPERATIONS, LOOP_KEYWORDS, WRITE_KEYWORDS } from './constants.js';

export {
  DatabaseError,
  ConnectionError,
  QueryError,
  TimeoutError,
  enhanceDatabaseError,
  buildErrorResult,
} from './errors.js';

export {
  dynamicImport,
  detectDriver,
  loadPostgresDriver,
  loadMysqlDriver,
  loadSqliteDriver,
  setMockDriver,
  clearMockDrivers,
} from './drivers.js';

export {
  isWriteOperation,
  isReadOnlyQuery,
  hasLimitClause,
  addLimitClause,
  analyzeQuery,
} from './query-analysis.js';

export { parseConnectionUrl } from './url-parser.js';

export {
  formatCellValue,
  formatQueryResult,
  formatSchemaResult,
} from './formatters.js';

export {
  getConnectionPool,
  shutdownConnectionPool,
  withConnection,
} from './sqlite-pool.js';

export type {
  PrismaOperation,
  N1Pattern,
} from './prisma-utils.js';
export {
  fileUsesPrisma,
  hasRelationInclusion,
  extractModelFromPrismaCall,
  isInsideLoop,
  analyzePrismaFile,
  generatePrismaRecommendations,
  findPrismaSourceFiles,
} from './prisma-utils.js';

export { parsePrismaForUnifiedSchema } from './parsers/prisma-schema.js';
export { parseDrizzleForUnifiedSchema } from './parsers/drizzle-schema.js';
export { parseSQLForUnifiedSchema } from './parsers/sql-schema.js';

export { executePostgres, getPostgresTypeName, executeMysql, getMysqlTypeName, executeSqlite, inferSqliteType } from './executors/index.js';
