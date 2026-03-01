/**
 * Database domain type definitions
 *
 * Shared types across schema extraction, Prisma analysis,
 * SQLite connection pooling, and query execution.
 *
 * @module core/database/types
 */

import type { McpResponse } from '../../shared/types.js';

// =============================================================================
// Schema Types
// =============================================================================

/**
 * Column definition in unified format across all schema sources.
 */
export interface DatabaseColumn {
  /** Column name as defined in the schema */
  name: string;
  /** Data type (varies by schema source: Prisma types, SQL types, etc.) */
  type: string;
  /** Whether the column accepts NULL values */
  nullable: boolean;
  /** Whether this column is part of the primary key */
  primary_key: boolean;
  /** Foreign key reference to another table and column */
  references?: {
    /** Referenced table name */
    table: string;
    /** Referenced column name */
    column: string;
  };
}

/**
 * Database index definition.
 */
export interface DatabaseIndex {
  /** Index name (may be auto-generated) */
  name: string;
  /** Array of column names included in the index */
  columns: string[];
  /** Whether this is a unique constraint index */
  unique: boolean;
}

/**
 * Database table definition in unified format.
 */
export interface DatabaseTable {
  /** Table name as defined in the schema */
  name: string;
  /** Array of column definitions for this table */
  columns: DatabaseColumn[];
  /** Array of indexes defined on this table */
  indexes: DatabaseIndex[];
}

/**
 * Database relation (foreign key relationship) definition.
 */
export interface DatabaseRelation {
  /** Source table containing the foreign key */
  from_table: string;
  /** Column in the source table that holds the foreign key */
  from_column: string;
  /** Target table being referenced */
  to_table: string;
  /** Column in the target table being referenced */
  to_column: string;
  /** Cardinality type of the relationship */
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * Supported schema source types.
 */
export type SchemaSource = 'prisma' | 'drizzle' | 'sql' | 'unknown';

/**
 * Result of database schema extraction.
 */
export interface DatabaseSchemaResult {
  /** The schema source that was detected and parsed */
  source: SchemaSource;
  /** Array of table definitions extracted from the schema */
  tables: DatabaseTable[];
  /** Array of relationship definitions between tables */
  relations: DatabaseRelation[];
  /** Path to the parsed schema file */
  raw_path: string;
}

// =============================================================================
// Schema Tool Args
// =============================================================================

/**
 * Arguments for the get_database_schema MCP tool.
 */
export interface DatabaseSchemaArgs {
  /** Project path relative to PROJECT_ROOT (defaults to '.') */
  path?: string;
}

// =============================================================================
// Prisma Tool Args
// =============================================================================

/**
 * Arguments for the get_prisma_operations MCP tool.
 */
export interface PrismaOpsArgs {
  /** Directory to analyze for Prisma operations */
  path?: string;
  /** Run N+1 pattern detection (default: true) */
  include_n1_detection?: boolean;
}

// =============================================================================
// SQLite Connection Types
// =============================================================================

/**
 * sql.js Database instance interface.
 */
export interface SqliteDatabase {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): QueryExecResult[];
  prepare(sql: string): SqliteStatement;
  close(): void;
  export(): Uint8Array;
  getRowsModified(): number;
}

/**
 * sql.js query result.
 */
export interface QueryExecResult {
  columns: string[];
  values: unknown[][];
}

/**
 * SQLite prepared statement interface (sql.js compatible).
 */
export interface SqliteStatement {
  run(params?: unknown[]): void;
  get(params?: unknown[]): unknown[];
  getAsObject(params?: unknown[]): Record<string, unknown>;
  step(): boolean;
  reset(): void;
  free(): void;
  bind(params?: unknown[]): boolean;
  getColumnNames(): string[];
}

/**
 * Result of a SQLite write operation.
 */
export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Connection options for SQLite pool.
 */
export interface SqliteConnectionOptions {
  /** Path to SQLite database file, or ':memory:' for in-memory */
  filepath: string;
  /** Open in readonly mode (default: true for safety) */
  readonly?: boolean;
  /** Timeout for acquiring busy connections in milliseconds */
  timeout?: number;
  /** Enable foreign key enforcement */
  foreignKeys?: boolean;
  /** Enable WAL mode for better concurrent access */
  walMode?: boolean;
}

// =============================================================================
// Query Execution Types
// =============================================================================

/**
 * Supported database driver types.
 */
export type DatabaseDriver = 'postgresql' | 'mysql' | 'sqlite' | 'unknown';

/**
 * Arguments for the query_database MCP tool.
 */
export interface QueryDatabaseArgs {
  /** SQL query to execute */
  query: string;
  /** Database connection URL (falls back to DATABASE_URL env var) */
  database_url?: string;
  /** Execute in readonly mode (default: true) */
  readonly?: boolean;
  /** Maximum rows to return (default: 100) */
  limit?: number;
  /** Output format */
  format?: 'json' | 'table';
  /** Include EXPLAIN output */
  explain?: boolean;
  /** Parameters for parameterized queries */
  params?: unknown[];
}

/**
 * Result of database query execution.
 */
export interface QueryResult {
  success: boolean;
  database_type: DatabaseDriver;
  rows: unknown[];
  row_count: number;
  columns: ColumnInfo[];
  execution_time_ms: number;
  query_executed: string;
  explain_output?: string;
  truncated?: boolean;
  error?: string;
  /** Number of rows affected by INSERT/UPDATE/DELETE */
  changes?: number;
  /** Last inserted row ID (SQLite) */
  last_insert_rowid?: number | bigint;
}

/**
 * Column metadata from query results.
 */
export interface ColumnInfo {
  name: string;
  type: string;
}

/**
 * Extended execution result from query executors.
 */
export interface ExecutionResult {
  rows: unknown[];
  columns: ColumnInfo[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Parsed database connection info.
 */
export interface DatabaseConnectionInfo {
  type: DatabaseDriver;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  /** For SQLite */
  filepath?: string;
}

/** Re-export for convenience */
export type { McpResponse };
