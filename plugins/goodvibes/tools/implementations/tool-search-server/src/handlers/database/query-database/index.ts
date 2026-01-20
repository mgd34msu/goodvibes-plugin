/**
 * Query Database Module
 *
 * Executes SQL queries against PostgreSQL, MySQL, and SQLite databases.
 * Database drivers are optional dependencies - handles missing drivers gracefully.
 *
 * SQLite Features:
 * - Connection pooling for better performance
 * - Parameterized queries for SQL injection prevention
 * - Write operation support (INSERT, UPDATE, DELETE)
 * - In-memory database support (:memory:)
 * - Schema introspection
 *
 * Module Structure:
 * - types.ts          - Type definitions
 * - query-analysis.ts - SQL query analysis functions
 * - url-parser.ts     - Database URL parsing
 * - drivers.ts        - Dynamic driver loading
 * - executors/        - Database-specific query execution
 * - formatters.ts     - Output formatting (table, JSON)
 * - errors.ts         - Error handling and enhancement
 * - handler.ts        - Main handler function
 */

// =============================================================================
// Public API
// =============================================================================

// Main handler
export { handleQueryDatabase } from './handler.js';

// Types
export type {
  DatabaseType,
  DatabaseConnectionInfo,
  ColumnInfo,
  QueryDatabaseArgs,
  QueryDatabaseResult,
  ExecutionResult,
  ExecutionOptions,
  SqliteExecutionResult,
} from './types.js';

// =============================================================================
// Internal exports for testing
// These functions are exported solely for unit testing purposes
// =============================================================================

import { getPostgresTypeName, getMysqlTypeName, inferSqliteType } from './executors/index.js';
import { executeQuery, executePostgresQuery, executeMysqlQuery, executeSqliteQuery } from './executors/index.js';
import { addLimitClause, hasLimitClause, isWriteOperation, isSelectQuery } from './query-analysis.js';
import { parseDatabaseUrl } from './url-parser.js';
import { formatAsTable, formatCellValue } from './formatters.js';
import { enhanceSqliteError } from './errors.js';
import { dynamicImport, getPostgresDriver, getMysqlDriver, getSqliteDriver, setMockDriver, clearMockDrivers } from './drivers.js';

/** @internal - Exported for testing only */
export const __testing__ = {
  // Type mappers
  getPostgresTypeName,
  getMysqlTypeName,
  inferSqliteType,

  // Query analysis
  addLimitClause,
  hasLimitClause,
  isWriteOperation,
  isSelectQuery,

  // URL parsing
  parseDatabaseUrl,

  // Query execution
  executeQuery,
  executePostgresQuery,
  executeMysqlQuery,
  executeSqliteQuery,

  // Formatting
  formatAsTable,
  formatCellValue,

  // Error handling
  enhanceSqliteError,

  // Driver loading
  dynamicImport,
  getPostgresDriver,
  getMysqlDriver,
  getSqliteDriver,

  // Mock driver helpers for testing
  setMockDriver,
  clearMockDrivers,
};
