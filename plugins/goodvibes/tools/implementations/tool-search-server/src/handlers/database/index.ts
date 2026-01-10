/**
 * Database tool handlers
 *
 * Provides database query execution capabilities:
 * - query_database: Execute SQL queries against databases
 *
 * Database drivers (pg, mysql2, better-sqlite3) are optional dependencies.
 * The handlers gracefully handle missing drivers with informative error messages.
 */

export {
  handleQueryDatabase,
  type QueryDatabaseArgs,
  type QueryDatabaseResult,
  type ColumnInfo,
  type DatabaseType,
} from './query-database.js';
