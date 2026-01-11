/**
 * Database tool handlers
 *
 * Provides database query execution capabilities:
 * - query_database: Execute SQL queries against PostgreSQL, MySQL, and SQLite databases
 *
 * SQLite-specific features:
 * - Connection pooling for better performance
 * - Parameterized queries for SQL injection prevention
 * - Write operation support (INSERT, UPDATE, DELETE)
 * - In-memory database support (:memory:)
 * - Schema introspection (list tables, describe structure)
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

// SQLite-specific exports
export {
  withConnection,
  getConnectionPool,
  shutdownConnectionPool,
  type SqliteDatabase,
  type SqliteStatement,
  type SqliteConnectionOptions,
  type SqliteRunResult,
  type SqliteColumnInfo,
} from './sqlite-connection.js';

export {
  listTables,
  listViews,
  getTableColumns,
  getTableIndexes,
  getTableForeignKeys,
  getTableTriggers,
  getCreateStatement,
  getRowCount,
  getTableSchema,
  getDatabaseSchema,
  type SqliteColumn,
  type SqliteIndex,
  type SqliteForeignKey,
  type SqliteTrigger,
  type SqliteTableSchema,
  type SqliteDatabaseSchema,
} from './sqlite-schema.js';
