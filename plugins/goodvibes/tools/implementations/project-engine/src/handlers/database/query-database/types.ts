/**
 * Type definitions for the query-database module
 *
 * Contains all interfaces and types used across the database query tool.
 */

import type { ToolResponse } from '../../../types.js';

/**
 * Supported database types
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'unknown';

/**
 * Parsed database connection info
 */
export interface DatabaseConnectionInfo {
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filepath?: string; // For SQLite
}

/**
 * Column metadata from query results
 */
export interface ColumnInfo {
  name: string;
  type: string;
}

/**
 * Arguments for query_database tool
 */
export interface QueryDatabaseArgs {
  query: string;
  database_url?: string;
  readonly?: boolean;
  limit?: number;
  format?: 'json' | 'table';
  explain?: boolean;
  /** Parameters for parameterized queries (SQLite, PostgreSQL) */
  params?: unknown[];
}

/**
 * Result of database query execution
 */
export interface QueryDatabaseResult {
  success: boolean;
  database_type: DatabaseType;
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
 * Extended execution result type from query executors
 */
export interface ExecutionResult {
  rows: unknown[];
  columns: ColumnInfo[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Execution options for queries
 */
export interface ExecutionOptions {
  params?: unknown[];
  readonly?: boolean;
}

/**
 * SQLite query execution result with additional metadata
 */
export interface SqliteExecutionResult {
  rows: unknown[];
  columns: ColumnInfo[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Re-export ToolResponse for convenience
 */
export type { ToolResponse };
